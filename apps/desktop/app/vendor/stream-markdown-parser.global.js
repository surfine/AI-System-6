/*! stream-markdown-parser v1.0.5 | MIT License | https://github.com/Simon-He95/markstream-vue/tree/main/packages/markdown-parser */
(function(global) {
"use strict";
var exports = {};
var module = { exports: exports };
(function(exports, module) {
//#region rolldown:runtime
var __create = Object.create;
var __defProp$1 = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function() {
	return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export$1 = (all) => {
	let target = {};
	for (var name in all) __defProp$1(target, name, {
		get: all[name],
		enumerable: true
	});
	return target;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp$1(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp$1(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion

//#region ../../node_modules/.pnpm/markdown-it-footnote@4.0.0/node_modules/markdown-it-footnote/index.mjs
function render_footnote_anchor_name(tokens, idx, options, env) {
	const n = Number(tokens[idx].meta.id + 1).toString();
	let prefix = "";
	if (typeof env.docId === "string") prefix = `-${env.docId}-`;
	return prefix + n;
}
function render_footnote_caption(tokens, idx) {
	let n = Number(tokens[idx].meta.id + 1).toString();
	if (tokens[idx].meta.subId > 0) n += `:${tokens[idx].meta.subId}`;
	return `[${n}]`;
}
function render_footnote_ref(tokens, idx, options, env, slf) {
	const id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
	const caption = slf.rules.footnote_caption(tokens, idx, options, env, slf);
	let refid = id;
	if (tokens[idx].meta.subId > 0) refid += `:${tokens[idx].meta.subId}`;
	return `<sup class="footnote-ref"><a href="#fn${id}" id="fnref${refid}">${caption}</a></sup>`;
}
function render_footnote_block_open(tokens, idx, options) {
	return (options.xhtmlOut ? "<hr class=\"footnotes-sep\" />\n" : "<hr class=\"footnotes-sep\">\n") + "<section class=\"footnotes\">\n<ol class=\"footnotes-list\">\n";
}
function render_footnote_block_close() {
	return "</ol>\n</section>\n";
}
function render_footnote_open(tokens, idx, options, env, slf) {
	let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
	if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
	return `<li id="fn${id}" class="footnote-item">`;
}
function render_footnote_close() {
	return "</li>\n";
}
function render_footnote_anchor(tokens, idx, options, env, slf) {
	let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
	if (tokens[idx].meta.subId > 0) id += `:${tokens[idx].meta.subId}`;
	return ` <a href="#fnref${id}" class="footnote-backref">\u21a9\uFE0E</a>`;
}
function footnote_plugin(md) {
	const parseLinkLabel$1 = md.helpers.parseLinkLabel;
	const isSpace$9 = md.utils.isSpace;
	md.renderer.rules.footnote_ref = render_footnote_ref;
	md.renderer.rules.footnote_block_open = render_footnote_block_open;
	md.renderer.rules.footnote_block_close = render_footnote_block_close;
	md.renderer.rules.footnote_open = render_footnote_open;
	md.renderer.rules.footnote_close = render_footnote_close;
	md.renderer.rules.footnote_anchor = render_footnote_anchor;
	md.renderer.rules.footnote_caption = render_footnote_caption;
	md.renderer.rules.footnote_anchor_name = render_footnote_anchor_name;
	function footnote_def(state, startLine, endLine, silent) {
		const start = state.bMarks[startLine] + state.tShift[startLine];
		const max = state.eMarks[startLine];
		if (start + 4 > max) return false;
		if (state.src.charCodeAt(start) !== 91) return false;
		if (state.src.charCodeAt(start + 1) !== 94) return false;
		let pos;
		for (pos = start + 2; pos < max; pos++) {
			if (state.src.charCodeAt(pos) === 32) return false;
			if (state.src.charCodeAt(pos) === 93) break;
		}
		if (pos === start + 2) return false;
		if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 58) return false;
		if (silent) return true;
		pos++;
		if (!state.env.footnotes) state.env.footnotes = {};
		if (!state.env.footnotes.refs) state.env.footnotes.refs = {};
		const label = state.src.slice(start + 2, pos - 2);
		state.env.footnotes.refs[`:${label}`] = -1;
		const token_fref_o = new state.Token("footnote_reference_open", "", 1);
		token_fref_o.meta = { label };
		token_fref_o.level = state.level++;
		state.tokens.push(token_fref_o);
		const oldBMark = state.bMarks[startLine];
		const oldTShift = state.tShift[startLine];
		const oldSCount = state.sCount[startLine];
		const oldParentType = state.parentType;
		const posAfterColon = pos;
		const initial = state.sCount[startLine] + pos - (state.bMarks[startLine] + state.tShift[startLine]);
		let offset = initial;
		while (pos < max) {
			const ch = state.src.charCodeAt(pos);
			if (isSpace$9(ch)) if (ch === 9) offset += 4 - offset % 4;
			else offset++;
			else break;
			pos++;
		}
		state.tShift[startLine] = pos - posAfterColon;
		state.sCount[startLine] = offset - initial;
		state.bMarks[startLine] = posAfterColon;
		state.blkIndent += 4;
		state.parentType = "footnote";
		if (state.sCount[startLine] < state.blkIndent) state.sCount[startLine] += state.blkIndent;
		state.md.block.tokenize(state, startLine, endLine, true);
		state.parentType = oldParentType;
		state.blkIndent -= 4;
		state.tShift[startLine] = oldTShift;
		state.sCount[startLine] = oldSCount;
		state.bMarks[startLine] = oldBMark;
		const token_fref_c = new state.Token("footnote_reference_close", "", -1);
		token_fref_c.level = --state.level;
		state.tokens.push(token_fref_c);
		return true;
	}
	function footnote_inline(state, silent) {
		const max = state.posMax;
		const start = state.pos;
		if (start + 2 >= max) return false;
		if (state.src.charCodeAt(start) !== 94) return false;
		if (state.src.charCodeAt(start + 1) !== 91) return false;
		const labelStart = start + 2;
		const labelEnd = parseLinkLabel$1(state, start + 1);
		if (labelEnd < 0) return false;
		if (!silent) {
			if (!state.env.footnotes) state.env.footnotes = {};
			if (!state.env.footnotes.list) state.env.footnotes.list = [];
			const footnoteId = state.env.footnotes.list.length;
			const tokens = [];
			state.md.inline.parse(state.src.slice(labelStart, labelEnd), state.md, state.env, tokens);
			const token = state.push("footnote_ref", "", 0);
			token.meta = { id: footnoteId };
			state.env.footnotes.list[footnoteId] = {
				content: state.src.slice(labelStart, labelEnd),
				tokens
			};
		}
		state.pos = labelEnd + 1;
		state.posMax = max;
		return true;
	}
	function footnote_ref(state, silent) {
		const max = state.posMax;
		const start = state.pos;
		if (start + 3 > max) return false;
		if (!state.env.footnotes || !state.env.footnotes.refs) return false;
		if (state.src.charCodeAt(start) !== 91) return false;
		if (state.src.charCodeAt(start + 1) !== 94) return false;
		let pos;
		for (pos = start + 2; pos < max; pos++) {
			if (state.src.charCodeAt(pos) === 32) return false;
			if (state.src.charCodeAt(pos) === 10) return false;
			if (state.src.charCodeAt(pos) === 93) break;
		}
		if (pos === start + 2) return false;
		if (pos >= max) return false;
		pos++;
		const label = state.src.slice(start + 2, pos - 1);
		if (typeof state.env.footnotes.refs[`:${label}`] === "undefined") return false;
		if (!silent) {
			if (!state.env.footnotes.list) state.env.footnotes.list = [];
			let footnoteId;
			if (state.env.footnotes.refs[`:${label}`] < 0) {
				footnoteId = state.env.footnotes.list.length;
				state.env.footnotes.list[footnoteId] = {
					label,
					count: 0
				};
				state.env.footnotes.refs[`:${label}`] = footnoteId;
			} else footnoteId = state.env.footnotes.refs[`:${label}`];
			const footnoteSubId = state.env.footnotes.list[footnoteId].count;
			state.env.footnotes.list[footnoteId].count++;
			const token = state.push("footnote_ref", "", 0);
			token.meta = {
				id: footnoteId,
				subId: footnoteSubId,
				label
			};
		}
		state.pos = pos;
		state.posMax = max;
		return true;
	}
	function footnote_tail(state) {
		let tokens;
		let current;
		let currentLabel;
		let insideRef = false;
		const refTokens = {};
		if (!state.env.footnotes) return;
		state.tokens = state.tokens.filter(function(tok) {
			if (tok.type === "footnote_reference_open") {
				insideRef = true;
				current = [];
				currentLabel = tok.meta.label;
				return false;
			}
			if (tok.type === "footnote_reference_close") {
				insideRef = false;
				refTokens[":" + currentLabel] = current;
				return false;
			}
			if (insideRef) current.push(tok);
			return !insideRef;
		});
		if (!state.env.footnotes.list) return;
		const list$1 = state.env.footnotes.list;
		state.tokens.push(new state.Token("footnote_block_open", "", 1));
		for (let i = 0, l = list$1.length; i < l; i++) {
			const token_fo = new state.Token("footnote_open", "", 1);
			token_fo.meta = {
				id: i,
				label: list$1[i].label
			};
			state.tokens.push(token_fo);
			if (list$1[i].tokens) {
				tokens = [];
				const token_po = new state.Token("paragraph_open", "p", 1);
				token_po.block = true;
				tokens.push(token_po);
				const token_i = new state.Token("inline", "", 0);
				token_i.children = list$1[i].tokens;
				token_i.content = list$1[i].content;
				tokens.push(token_i);
				const token_pc = new state.Token("paragraph_close", "p", -1);
				token_pc.block = true;
				tokens.push(token_pc);
			} else if (list$1[i].label) tokens = refTokens[`:${list$1[i].label}`];
			if (tokens) state.tokens = state.tokens.concat(tokens);
			let lastParagraph;
			if (state.tokens[state.tokens.length - 1].type === "paragraph_close") lastParagraph = state.tokens.pop();
			else lastParagraph = null;
			const t = list$1[i].count > 0 ? list$1[i].count : 1;
			for (let j = 0; j < t; j++) {
				const token_a = new state.Token("footnote_anchor", "", 0);
				token_a.meta = {
					id: i,
					subId: j,
					label: list$1[i].label
				};
				state.tokens.push(token_a);
			}
			if (lastParagraph) state.tokens.push(lastParagraph);
			state.tokens.push(new state.Token("footnote_close", "", -1));
		}
		state.tokens.push(new state.Token("footnote_block_close", "", -1));
	}
	md.block.ruler.before("reference", "footnote_def", footnote_def, { alt: ["paragraph", "reference"] });
	md.inline.ruler.after("image", "footnote_inline", footnote_inline);
	md.inline.ruler.after("footnote_inline", "footnote_ref", footnote_ref);
	md.core.ruler.after("inline", "footnote_tail", footnote_tail);
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-ins@4.0.0/node_modules/markdown-it-ins/index.mjs
function ins_plugin(md) {
	function tokenize(state, silent) {
		const start = state.pos;
		const marker = state.src.charCodeAt(start);
		if (silent) return false;
		if (marker !== 43) return false;
		const scanned = state.scanDelims(state.pos, true);
		let len = scanned.length;
		const ch = String.fromCharCode(marker);
		if (len < 2) return false;
		if (len % 2) {
			const token = state.push("text", "", 0);
			token.content = ch;
			len--;
		}
		for (let i = 0; i < len; i += 2) {
			const token = state.push("text", "", 0);
			token.content = ch + ch;
			if (!scanned.can_open && !scanned.can_close) continue;
			state.delimiters.push({
				marker,
				length: 0,
				jump: i / 2,
				token: state.tokens.length - 1,
				end: -1,
				open: scanned.can_open,
				close: scanned.can_close
			});
		}
		state.pos += scanned.length;
		return true;
	}
	function postProcess$2(state, delimiters) {
		let token;
		const loneMarkers = [];
		const max = delimiters.length;
		for (let i = 0; i < max; i++) {
			const startDelim = delimiters[i];
			if (startDelim.marker !== 43) continue;
			if (startDelim.end === -1) continue;
			const endDelim = delimiters[startDelim.end];
			token = state.tokens[startDelim.token];
			token.type = "ins_open";
			token.tag = "ins";
			token.nesting = 1;
			token.markup = "++";
			token.content = "";
			token = state.tokens[endDelim.token];
			token.type = "ins_close";
			token.tag = "ins";
			token.nesting = -1;
			token.markup = "++";
			token.content = "";
			if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "+") loneMarkers.push(endDelim.token - 1);
		}
		while (loneMarkers.length) {
			const i = loneMarkers.pop();
			let j = i + 1;
			while (j < state.tokens.length && state.tokens[j].type === "ins_close") j++;
			j--;
			if (i !== j) {
				token = state.tokens[j];
				state.tokens[j] = state.tokens[i];
				state.tokens[i] = token;
			}
		}
	}
	md.inline.ruler.before("emphasis", "ins", tokenize);
	md.inline.ruler2.before("emphasis", "ins", function(state) {
		const tokens_meta = state.tokens_meta;
		const max = (state.tokens_meta || []).length;
		postProcess$2(state, state.delimiters);
		for (let curr = 0; curr < max; curr++) if (tokens_meta[curr] && tokens_meta[curr].delimiters) postProcess$2(state, tokens_meta[curr].delimiters);
	});
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-mark@4.0.0/node_modules/markdown-it-mark/index.mjs
function ins_plugin$1(md) {
	function tokenize(state, silent) {
		const start = state.pos;
		const marker = state.src.charCodeAt(start);
		if (silent) return false;
		if (marker !== 61) return false;
		const scanned = state.scanDelims(state.pos, true);
		let len = scanned.length;
		const ch = String.fromCharCode(marker);
		if (len < 2) return false;
		if (len % 2) {
			const token = state.push("text", "", 0);
			token.content = ch;
			len--;
		}
		for (let i = 0; i < len; i += 2) {
			const token = state.push("text", "", 0);
			token.content = ch + ch;
			if (!scanned.can_open && !scanned.can_close) continue;
			state.delimiters.push({
				marker,
				length: 0,
				jump: i / 2,
				token: state.tokens.length - 1,
				end: -1,
				open: scanned.can_open,
				close: scanned.can_close
			});
		}
		state.pos += scanned.length;
		return true;
	}
	function postProcess$2(state, delimiters) {
		const loneMarkers = [];
		const max = delimiters.length;
		for (let i = 0; i < max; i++) {
			const startDelim = delimiters[i];
			if (startDelim.marker !== 61) continue;
			if (startDelim.end === -1) continue;
			const endDelim = delimiters[startDelim.end];
			const token_o = state.tokens[startDelim.token];
			token_o.type = "mark_open";
			token_o.tag = "mark";
			token_o.nesting = 1;
			token_o.markup = "==";
			token_o.content = "";
			const token_c = state.tokens[endDelim.token];
			token_c.type = "mark_close";
			token_c.tag = "mark";
			token_c.nesting = -1;
			token_c.markup = "==";
			token_c.content = "";
			if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "=") loneMarkers.push(endDelim.token - 1);
		}
		while (loneMarkers.length) {
			const i = loneMarkers.pop();
			let j = i + 1;
			while (j < state.tokens.length && state.tokens[j].type === "mark_close") j++;
			j--;
			if (i !== j) {
				const token = state.tokens[j];
				state.tokens[j] = state.tokens[i];
				state.tokens[i] = token;
			}
		}
	}
	md.inline.ruler.before("emphasis", "mark", tokenize);
	md.inline.ruler2.before("emphasis", "mark", function(state) {
		let curr;
		const tokens_meta = state.tokens_meta;
		const max = (state.tokens_meta || []).length;
		postProcess$2(state, state.delimiters);
		for (curr = 0; curr < max; curr++) if (tokens_meta[curr] && tokens_meta[curr].delimiters) postProcess$2(state, tokens_meta[curr].delimiters);
	});
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-sub@2.0.0/node_modules/markdown-it-sub/index.mjs
const UNESCAPE_RE$1 = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;
function subscript(state, silent) {
	const max = state.posMax;
	const start = state.pos;
	if (state.src.charCodeAt(start) !== 126) return false;
	if (silent) return false;
	if (start + 2 >= max) return false;
	state.pos = start + 1;
	let found = false;
	while (state.pos < max) {
		if (state.src.charCodeAt(state.pos) === 126) {
			found = true;
			break;
		}
		state.md.inline.skipToken(state);
	}
	if (!found || start + 1 === state.pos) {
		state.pos = start;
		return false;
	}
	const content = state.src.slice(start + 1, state.pos);
	if (content.match(/(^|[^\\])(\\\\)*\s/)) {
		state.pos = start;
		return false;
	}
	state.posMax = state.pos;
	state.pos = start + 1;
	const token_so = state.push("sub_open", "sub", 1);
	token_so.markup = "~";
	const token_t = state.push("text", "", 0);
	token_t.content = content.replace(UNESCAPE_RE$1, "$1");
	const token_sc = state.push("sub_close", "sub", -1);
	token_sc.markup = "~";
	state.pos = state.posMax + 1;
	state.posMax = max;
	return true;
}
function sub_plugin(md) {
	md.inline.ruler.after("emphasis", "sub", subscript);
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-sup@2.0.0/node_modules/markdown-it-sup/index.mjs
const UNESCAPE_RE = /\\([ \\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;
function superscript(state, silent) {
	const max = state.posMax;
	const start = state.pos;
	if (state.src.charCodeAt(start) !== 94) return false;
	if (silent) return false;
	if (start + 2 >= max) return false;
	state.pos = start + 1;
	let found = false;
	while (state.pos < max) {
		if (state.src.charCodeAt(state.pos) === 94) {
			found = true;
			break;
		}
		state.md.inline.skipToken(state);
	}
	if (!found || start + 1 === state.pos) {
		state.pos = start;
		return false;
	}
	const content = state.src.slice(start + 1, state.pos);
	if (content.match(/(^|[^\\])(\\\\)*\s/)) {
		state.pos = start;
		return false;
	}
	state.posMax = state.pos;
	state.pos = start + 1;
	const token_so = state.push("sup_open", "sup", 1);
	token_so.markup = "^";
	const token_t = state.push("text", "", 0);
	token_t.content = content.replace(UNESCAPE_RE, "$1");
	const token_sc = state.push("sup_close", "sup", -1);
	token_sc.markup = "^";
	state.pos = state.posMax + 1;
	state.posMax = max;
	return true;
}
function sup_plugin(md) {
	md.inline.ruler.after("emphasis", "sup", superscript);
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-task-checkbox@1.0.6/node_modules/markdown-it-task-checkbox/index.js
var require_markdown_it_task_checkbox = /* @__PURE__ */ __commonJS({ "../../node_modules/.pnpm/markdown-it-task-checkbox@1.0.6/node_modules/markdown-it-task-checkbox/index.js": ((exports, module) => {
	module.exports = function(md, options) {
		options = Object.assign({}, {
			disabled: true,
			divWrap: false,
			divClass: "checkbox",
			idPrefix: "cbx_",
			ulClass: "task-list",
			liClass: "task-list-item"
		}, options);
		md.core.ruler.after("inline", "github-task-lists", function(state) {
			var tokens = state.tokens;
			var lastId = 0;
			for (var i = 2; i < tokens.length; i++) if (isTodoItem(tokens, i)) {
				todoify(tokens[i], lastId, options, state.Token);
				lastId += 1;
				attrSet$1(tokens[i - 2], "class", options.liClass);
				attrSet$1(tokens[parentToken(tokens, i - 2)], "class", options.ulClass);
			}
		});
	};
	function attrSet$1(token, name, value) {
		var index = token.attrIndex(name);
		var attr = [name, value];
		if (index < 0) token.attrPush(attr);
		else token.attrs[index] = attr;
	}
	function parentToken(tokens, index) {
		var targetLevel = tokens[index].level - 1;
		for (var i = index - 1; i >= 0; i--) if (tokens[i].level === targetLevel) return i;
		return -1;
	}
	function isTodoItem(tokens, index) {
		return isInline(tokens[index]) && isParagraph(tokens[index - 1]) && isListItem(tokens[index - 2]) && startsWithTodoMarkdown(tokens[index]);
	}
	function todoify(token, lastId, options, TokenConstructor) {
		var id = options.idPrefix + lastId;
		token.children[0].content = token.children[0].content.slice(3);
		token.children.unshift(beginLabel(id, TokenConstructor));
		token.children.push(endLabel(TokenConstructor));
		token.children.unshift(makeCheckbox(token, id, options, TokenConstructor));
		if (options.divWrap) {
			token.children.unshift(beginWrap(options, TokenConstructor));
			token.children.push(endWrap(TokenConstructor));
		}
	}
	function makeCheckbox(token, id, options, TokenConstructor) {
		var checkbox = new TokenConstructor("checkbox_input", "input", 0);
		checkbox.attrs = [["type", "checkbox"], ["id", id]];
		if (/^\[[xX]\][ \u00A0]/.test(token.content) === true) checkbox.attrs.push(["checked", "true"]);
		if (options.disabled === true) checkbox.attrs.push(["disabled", "true"]);
		return checkbox;
	}
	function beginLabel(id, TokenConstructor) {
		var label = new TokenConstructor("label_open", "label", 1);
		label.attrs = [["for", id]];
		return label;
	}
	function endLabel(TokenConstructor) {
		return new TokenConstructor("label_close", "label", -1);
	}
	function beginWrap(options, TokenConstructor) {
		var token = new TokenConstructor("checkbox_open", "div", 0);
		token.attrs = [["class", options.divClass]];
		return token;
	}
	function endWrap(TokenConstructor) {
		return new TokenConstructor("checkbox_close", "div", -1);
	}
	function isInline(token) {
		return token.type === "inline";
	}
	function isParagraph(token) {
		return token.type === "paragraph_open";
	}
	function isListItem(token) {
		return token.type === "list_item_open";
	}
	function startsWithTodoMarkdown(token) {
		return /^\[[xX \u00A0]\][ \u00A0]/.test(token.content);
	}
}) });

//#endregion
//#region ../../node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/esm/generated/decode-data-html.js
var decode_data_html_default = new Uint16Array("ᵁ<Õıʊҝջאٵ۞ޢߖࠏ੊ઑඡ๭༉༦჊ረዡᐕᒝᓃᓟᔥ\0\0\0\0\0\0ᕫᛍᦍᰒᷝ὾⁠↰⊍⏀⏻⑂⠤⤒ⴈ⹈⿎〖㊺㘹㞬㣾㨨㩱㫠㬮ࠀEMabcfglmnoprstu\\bfms¦³¹ÈÏlig耻Æ䃆P耻&䀦cute耻Á䃁reve;䄂Āiyx}rc耻Â䃂;䐐r;쀀𝔄rave耻À䃀pha;䎑acr;䄀d;橓Āgp¡on;䄄f;쀀𝔸plyFunction;恡ing耻Å䃅Ācs¾Ãr;쀀𝒜ign;扔ilde耻Ã䃃ml耻Ä䃄ЀaceforsuåûþėĜĢħĪĀcrêòkslash;或Ŷöø;櫧ed;挆y;䐑ƀcrtąċĔause;戵noullis;愬a;䎒r;쀀𝔅pf;쀀𝔹eve;䋘còēmpeq;扎܀HOacdefhilorsuōőŖƀƞƢƵƷƺǜȕɳɸɾcy;䐧PY耻©䂩ƀcpyŝŢźute;䄆Ā;iŧŨ拒talDifferentialD;慅leys;愭ȀaeioƉƎƔƘron;䄌dil耻Ç䃇rc;䄈nint;戰ot;䄊ĀdnƧƭilla;䂸terDot;䂷òſi;䎧rcleȀDMPTǇǋǑǖot;抙inus;抖lus;投imes;抗oĀcsǢǸkwiseContourIntegral;戲eCurlyĀDQȃȏoubleQuote;思uote;怙ȀlnpuȞȨɇɕonĀ;eȥȦ户;橴ƀgitȯȶȺruent;扡nt;戯ourIntegral;戮ĀfrɌɎ;愂oduct;成nterClockwiseContourIntegral;戳oss;樯cr;쀀𝒞pĀ;Cʄʅ拓ap;才րDJSZacefiosʠʬʰʴʸˋ˗ˡ˦̳ҍĀ;oŹʥtrahd;椑cy;䐂cy;䐅cy;䐏ƀgrsʿ˄ˇger;怡r;憡hv;櫤Āayː˕ron;䄎;䐔lĀ;t˝˞戇a;䎔r;쀀𝔇Āaf˫̧Ācm˰̢riticalȀADGT̖̜̀̆cute;䂴oŴ̋̍;䋙bleAcute;䋝rave;䁠ilde;䋜ond;拄ferentialD;慆Ѱ̽\0\0\0͔͂\0Ѕf;쀀𝔻ƀ;DE͈͉͍䂨ot;惜qual;扐blèCDLRUVͣͲ΂ϏϢϸontourIntegraìȹoɴ͹\0\0ͻ»͉nArrow;懓Āeo·ΤftƀARTΐΖΡrrow;懐ightArrow;懔eåˊngĀLRΫτeftĀARγιrrow;柸ightArrow;柺ightArrow;柹ightĀATϘϞrrow;懒ee;抨pɁϩ\0\0ϯrrow;懑ownArrow;懕erticalBar;戥ǹABLRTaВЪаўѿͼrrowƀ;BUНОТ憓ar;椓pArrow;懵reve;䌑eft˒к\0ц\0ѐightVector;楐eeVector;楞ectorĀ;Bљњ憽ar;楖ightǔѧ\0ѱeeVector;楟ectorĀ;BѺѻ懁ar;楗eeĀ;A҆҇护rrow;憧ĀctҒҗr;쀀𝒟rok;䄐ࠀNTacdfglmopqstuxҽӀӄӋӞӢӧӮӵԡԯԶՒ՝ՠեG;䅊H耻Ð䃐cute耻É䃉ƀaiyӒӗӜron;䄚rc耻Ê䃊;䐭ot;䄖r;쀀𝔈rave耻È䃈ement;戈ĀapӺӾcr;䄒tyɓԆ\0\0ԒmallSquare;旻erySmallSquare;斫ĀgpԦԪon;䄘f;쀀𝔼silon;䎕uĀaiԼՉlĀ;TՂՃ橵ilde;扂librium;懌Āci՗՚r;愰m;橳a;䎗ml耻Ë䃋Āipժկsts;戃onentialE;慇ʀcfiosօֈ֍ֲ׌y;䐤r;쀀𝔉lledɓ֗\0\0֣mallSquare;旼erySmallSquare;斪Ͱֺ\0ֿ\0\0ׄf;쀀𝔽All;戀riertrf;愱cò׋؀JTabcdfgorstר׬ׯ׺؀ؒؖ؛؝أ٬ٲcy;䐃耻>䀾mmaĀ;d׷׸䎓;䏜reve;䄞ƀeiy؇،ؐdil;䄢rc;䄜;䐓ot;䄠r;쀀𝔊;拙pf;쀀𝔾eater̀EFGLSTصلَٖٛ٦qualĀ;Lؾؿ扥ess;招ullEqual;执reater;檢ess;扷lantEqual;橾ilde;扳cr;쀀𝒢;扫ЀAacfiosuڅڋږڛڞڪھۊRDcy;䐪Āctڐڔek;䋇;䁞irc;䄤r;愌lbertSpace;愋ǰگ\0ڲf;愍izontalLine;攀Āctۃۅòکrok;䄦mpńېۘownHumðįqual;扏܀EJOacdfgmnostuۺ۾܃܇܎ܚܞܡܨ݄ݸދޏޕcy;䐕lig;䄲cy;䐁cute耻Í䃍Āiyܓܘrc耻Î䃎;䐘ot;䄰r;愑rave耻Ì䃌ƀ;apܠܯܿĀcgܴܷr;䄪inaryI;慈lieóϝǴ݉\0ݢĀ;eݍݎ戬Āgrݓݘral;戫section;拂isibleĀCTݬݲomma;恣imes;恢ƀgptݿރވon;䄮f;쀀𝕀a;䎙cr;愐ilde;䄨ǫޚ\0ޞcy;䐆l耻Ï䃏ʀcfosuެ޷޼߂ߐĀiyޱ޵rc;䄴;䐙r;쀀𝔍pf;쀀𝕁ǣ߇\0ߌr;쀀𝒥rcy;䐈kcy;䐄΀HJacfosߤߨ߽߬߱ࠂࠈcy;䐥cy;䐌ppa;䎚Āey߶߻dil;䄶;䐚r;쀀𝔎pf;쀀𝕂cr;쀀𝒦րJTaceflmostࠥࠩࠬࡐࡣ঳সে্਷ੇcy;䐉耻<䀼ʀcmnpr࠷࠼ࡁࡄࡍute;䄹bda;䎛g;柪lacetrf;愒r;憞ƀaeyࡗ࡜ࡡron;䄽dil;䄻;䐛Āfsࡨ॰tԀACDFRTUVarࡾࢩࢱࣦ࣠ࣼयज़ΐ४Ānrࢃ࢏gleBracket;柨rowƀ;BR࢙࢚࢞憐ar;懤ightArrow;懆eiling;挈oǵࢷ\0ࣃbleBracket;柦nǔࣈ\0࣒eeVector;楡ectorĀ;Bࣛࣜ懃ar;楙loor;挊ightĀAV࣯ࣵrrow;憔ector;楎Āerँगeƀ;AVउऊऐ抣rrow;憤ector;楚iangleƀ;BEतथऩ抲ar;槏qual;抴pƀDTVषूौownVector;楑eeVector;楠ectorĀ;Bॖॗ憿ar;楘ectorĀ;B॥०憼ar;楒ightáΜs̀EFGLSTॾঋকঝঢভqualGreater;拚ullEqual;扦reater;扶ess;檡lantEqual;橽ilde;扲r;쀀𝔏Ā;eঽা拘ftarrow;懚idot;䄿ƀnpw৔ਖਛgȀLRlr৞৷ਂਐeftĀAR০৬rrow;柵ightArrow;柷ightArrow;柶eftĀarγਊightáοightáϊf;쀀𝕃erĀLRਢਬeftArrow;憙ightArrow;憘ƀchtਾੀੂòࡌ;憰rok;䅁;扪Ѐacefiosuਗ਼੝੠੷੼અઋ઎p;椅y;䐜Ādl੥੯iumSpace;恟lintrf;愳r;쀀𝔐nusPlus;戓pf;쀀𝕄cò੶;䎜ҀJacefostuણધભીଔଙඑ඗ඞcy;䐊cute;䅃ƀaey઴હાron;䅇dil;䅅;䐝ƀgswે૰଎ativeƀMTV૓૟૨ediumSpace;怋hiĀcn૦૘ë૙eryThiî૙tedĀGL૸ଆreaterGreateòٳessLesóੈLine;䀊r;쀀𝔑ȀBnptଢନଷ଺reak;恠BreakingSpace;䂠f;愕ڀ;CDEGHLNPRSTV୕ୖ୪୼஡௫ఄ౞಄ದ೘ൡඅ櫬Āou୛୤ngruent;扢pCap;扭oubleVerticalBar;戦ƀlqxஃஊ஛ement;戉ualĀ;Tஒஓ扠ilde;쀀≂̸ists;戄reater΀;EFGLSTஶஷ஽௉௓௘௥扯qual;扱ullEqual;쀀≧̸reater;쀀≫̸ess;批lantEqual;쀀⩾̸ilde;扵umpń௲௽ownHump;쀀≎̸qual;쀀≏̸eĀfsఊధtTriangleƀ;BEచఛడ拪ar;쀀⧏̸qual;括s̀;EGLSTవశ఼ౄోౘ扮qual;扰reater;扸ess;쀀≪̸lantEqual;쀀⩽̸ilde;扴estedĀGL౨౹reaterGreater;쀀⪢̸essLess;쀀⪡̸recedesƀ;ESಒಓಛ技qual;쀀⪯̸lantEqual;拠ĀeiಫಹverseElement;戌ghtTriangleƀ;BEೋೌ೒拫ar;쀀⧐̸qual;拭ĀquೝഌuareSuĀbp೨೹setĀ;E೰ೳ쀀⊏̸qual;拢ersetĀ;Eഃആ쀀⊐̸qual;拣ƀbcpഓതൎsetĀ;Eഛഞ쀀⊂⃒qual;抈ceedsȀ;ESTലള഻െ抁qual;쀀⪰̸lantEqual;拡ilde;쀀≿̸ersetĀ;E൘൛쀀⊃⃒qual;抉ildeȀ;EFT൮൯൵ൿ扁qual;扄ullEqual;扇ilde;扉erticalBar;戤cr;쀀𝒩ilde耻Ñ䃑;䎝܀Eacdfgmoprstuvලෂ෉෕ෛ෠෧෼ขภยา฿ไlig;䅒cute耻Ó䃓Āiy෎ීrc耻Ô䃔;䐞blac;䅐r;쀀𝔒rave耻Ò䃒ƀaei෮ෲ෶cr;䅌ga;䎩cron;䎟pf;쀀𝕆enCurlyĀDQฎบoubleQuote;怜uote;怘;橔Āclวฬr;쀀𝒪ash耻Ø䃘iŬื฼de耻Õ䃕es;樷ml耻Ö䃖erĀBP๋๠Āar๐๓r;怾acĀek๚๜;揞et;掴arenthesis;揜Ҁacfhilors๿ງຊຏຒດຝະ໼rtialD;戂y;䐟r;쀀𝔓i;䎦;䎠usMinus;䂱Āipຢອncareplanåڝf;愙Ȁ;eio຺ູ໠໤檻cedesȀ;EST່້໏໚扺qual;檯lantEqual;扼ilde;找me;怳Ādp໩໮uct;戏ortionĀ;aȥ໹l;戝Āci༁༆r;쀀𝒫;䎨ȀUfos༑༖༛༟OT耻\"䀢r;쀀𝔔pf;愚cr;쀀𝒬؀BEacefhiorsu༾གྷཇའཱིྦྷྪྭ႖ႩႴႾarr;椐G耻®䂮ƀcnrཎནབute;䅔g;柫rĀ;tཛྷཝ憠l;椖ƀaeyཧཬཱron;䅘dil;䅖;䐠Ā;vླྀཹ愜erseĀEUྂྙĀlq྇ྎement;戋uilibrium;懋pEquilibrium;楯r»ཹo;䎡ghtЀACDFTUVa࿁࿫࿳ဢဨၛႇϘĀnr࿆࿒gleBracket;柩rowƀ;BL࿜࿝࿡憒ar;懥eftArrow;懄eiling;按oǵ࿹\0စbleBracket;柧nǔည\0နeeVector;楝ectorĀ;Bဝသ懂ar;楕loor;挋Āerိ၃eƀ;AVဵံြ抢rrow;憦ector;楛iangleƀ;BEၐၑၕ抳ar;槐qual;抵pƀDTVၣၮၸownVector;楏eeVector;楜ectorĀ;Bႂႃ憾ar;楔ectorĀ;B႑႒懀ar;楓Āpuႛ႞f;愝ndImplies;楰ightarrow;懛ĀchႹႼr;愛;憱leDelayed;槴ڀHOacfhimoqstuფჱჷჽᄙᄞᅑᅖᅡᅧᆵᆻᆿĀCcჩხHcy;䐩y;䐨FTcy;䐬cute;䅚ʀ;aeiyᄈᄉᄎᄓᄗ檼ron;䅠dil;䅞rc;䅜;䐡r;쀀𝔖ortȀDLRUᄪᄴᄾᅉownArrow»ОeftArrow»࢚ightArrow»࿝pArrow;憑gma;䎣allCircle;战pf;쀀𝕊ɲᅭ\0\0ᅰt;戚areȀ;ISUᅻᅼᆉᆯ斡ntersection;抓uĀbpᆏᆞsetĀ;Eᆗᆘ抏qual;抑ersetĀ;Eᆨᆩ抐qual;抒nion;抔cr;쀀𝒮ar;拆ȀbcmpᇈᇛሉላĀ;sᇍᇎ拐etĀ;Eᇍᇕqual;抆ĀchᇠህeedsȀ;ESTᇭᇮᇴᇿ扻qual;檰lantEqual;扽ilde;承Tháྌ;我ƀ;esሒሓሣ拑rsetĀ;Eሜም抃qual;抇et»ሓրHRSacfhiorsሾቄ቉ቕ቞ቱቶኟዂወዑORN耻Þ䃞ADE;愢ĀHc቎ቒcy;䐋y;䐦Ābuቚቜ;䀉;䎤ƀaeyብቪቯron;䅤dil;䅢;䐢r;쀀𝔗Āeiቻ኉ǲኀ\0ኇefore;戴a;䎘Ācn኎ኘkSpace;쀀  Space;怉ldeȀ;EFTካኬኲኼ戼qual;扃ullEqual;扅ilde;扈pf;쀀𝕋ipleDot;惛Āctዖዛr;쀀𝒯rok;䅦ૡዷጎጚጦ\0ጬጱ\0\0\0\0\0ጸጽ፷ᎅ\0᏿ᐄᐊᐐĀcrዻጁute耻Ú䃚rĀ;oጇገ憟cir;楉rǣጓ\0጖y;䐎ve;䅬Āiyጞጣrc耻Û䃛;䐣blac;䅰r;쀀𝔘rave耻Ù䃙acr;䅪Ādiፁ፩erĀBPፈ፝Āarፍፐr;䁟acĀekፗፙ;揟et;掵arenthesis;揝onĀ;P፰፱拃lus;抎Āgp፻፿on;䅲f;쀀𝕌ЀADETadps᎕ᎮᎸᏄϨᏒᏗᏳrrowƀ;BDᅐᎠᎤar;椒ownArrow;懅ownArrow;憕quilibrium;楮eeĀ;AᏋᏌ报rrow;憥ownáϳerĀLRᏞᏨeftArrow;憖ightArrow;憗iĀ;lᏹᏺ䏒on;䎥ing;䅮cr;쀀𝒰ilde;䅨ml耻Ü䃜ҀDbcdefosvᐧᐬᐰᐳᐾᒅᒊᒐᒖash;披ar;櫫y;䐒ashĀ;lᐻᐼ抩;櫦Āerᑃᑅ;拁ƀbtyᑌᑐᑺar;怖Ā;iᑏᑕcalȀBLSTᑡᑥᑪᑴar;戣ine;䁼eparator;杘ilde;所ThinSpace;怊r;쀀𝔙pf;쀀𝕍cr;쀀𝒱dash;抪ʀcefosᒧᒬᒱᒶᒼirc;䅴dge;拀r;쀀𝔚pf;쀀𝕎cr;쀀𝒲Ȁfiosᓋᓐᓒᓘr;쀀𝔛;䎞pf;쀀𝕏cr;쀀𝒳ҀAIUacfosuᓱᓵᓹᓽᔄᔏᔔᔚᔠcy;䐯cy;䐇cy;䐮cute耻Ý䃝Āiyᔉᔍrc;䅶;䐫r;쀀𝔜pf;쀀𝕐cr;쀀𝒴ml;䅸ЀHacdefosᔵᔹᔿᕋᕏᕝᕠᕤcy;䐖cute;䅹Āayᕄᕉron;䅽;䐗ot;䅻ǲᕔ\0ᕛoWidtè૙a;䎖r;愨pf;愤cr;쀀𝒵௡ᖃᖊᖐ\0ᖰᖶᖿ\0\0\0\0ᗆᗛᗫᙟ᙭\0ᚕ᚛ᚲᚹ\0ᚾcute耻á䃡reve;䄃̀;Ediuyᖜᖝᖡᖣᖨᖭ戾;쀀∾̳;房rc耻â䃢te肻´̆;䐰lig耻æ䃦Ā;r²ᖺ;쀀𝔞rave耻à䃠ĀepᗊᗖĀfpᗏᗔsym;愵èᗓha;䎱ĀapᗟcĀclᗤᗧr;䄁g;樿ɤᗰ\0\0ᘊʀ;adsvᗺᗻᗿᘁᘇ戧nd;橕;橜lope;橘;橚΀;elmrszᘘᘙᘛᘞᘿᙏᙙ戠;榤e»ᘙsdĀ;aᘥᘦ戡ѡᘰᘲᘴᘶᘸᘺᘼᘾ;榨;榩;榪;榫;榬;榭;榮;榯tĀ;vᙅᙆ戟bĀ;dᙌᙍ抾;榝Āptᙔᙗh;戢»¹arr;捼Āgpᙣᙧon;䄅f;쀀𝕒΀;Eaeiop዁ᙻᙽᚂᚄᚇᚊ;橰cir;橯;扊d;手s;䀧roxĀ;e዁ᚒñᚃing耻å䃥ƀctyᚡᚦᚨr;쀀𝒶;䀪mpĀ;e዁ᚯñʈilde耻ã䃣ml耻ä䃤Āciᛂᛈoninôɲnt;樑ࠀNabcdefiklnoprsu᛭ᛱᜰ᜼ᝃᝈ᝸᝽០៦ᠹᡐᜍ᤽᥈ᥰot;櫭Ācrᛶ᜞kȀcepsᜀᜅᜍᜓong;扌psilon;䏶rime;怵imĀ;e᜚᜛戽q;拍Ŷᜢᜦee;抽edĀ;gᜬᜭ挅e»ᜭrkĀ;t፜᜷brk;掶Āoyᜁᝁ;䐱quo;怞ʀcmprtᝓ᝛ᝡᝤᝨausĀ;eĊĉptyv;榰séᜌnoõēƀahwᝯ᝱ᝳ;䎲;愶een;扬r;쀀𝔟g΀costuvwឍឝឳេ៕៛៞ƀaiuបពរðݠrc;旯p»፱ƀdptឤឨឭot;樀lus;樁imes;樂ɱឹ\0\0ើcup;樆ar;昅riangleĀdu៍្own;施p;斳plus;樄eåᑄåᒭarow;植ƀako៭ᠦᠵĀcn៲ᠣkƀlst៺֫᠂ozenge;槫riangleȀ;dlr᠒᠓᠘᠝斴own;斾eft;旂ight;斸k;搣Ʊᠫ\0ᠳƲᠯ\0ᠱ;斒;斑4;斓ck;斈ĀeoᠾᡍĀ;qᡃᡆ쀀=⃥uiv;쀀≡⃥t;挐Ȁptwxᡙᡞᡧᡬf;쀀𝕓Ā;tᏋᡣom»Ꮜtie;拈؀DHUVbdhmptuvᢅᢖᢪᢻᣗᣛᣬ᣿ᤅᤊᤐᤡȀLRlrᢎᢐᢒᢔ;敗;敔;敖;敓ʀ;DUduᢡᢢᢤᢦᢨ敐;敦;敩;敤;敧ȀLRlrᢳᢵᢷᢹ;敝;敚;敜;教΀;HLRhlrᣊᣋᣍᣏᣑᣓᣕ救;敬;散;敠;敫;敢;敟ox;槉ȀLRlrᣤᣦᣨᣪ;敕;敒;攐;攌ʀ;DUduڽ᣷᣹᣻᣽;敥;敨;攬;攴inus;抟lus;択imes;抠ȀLRlrᤙᤛᤝ᤟;敛;敘;攘;攔΀;HLRhlrᤰᤱᤳᤵᤷ᤻᤹攂;敪;敡;敞;攼;攤;攜Āevģ᥂bar耻¦䂦Ȁceioᥑᥖᥚᥠr;쀀𝒷mi;恏mĀ;e᜚᜜lƀ;bhᥨᥩᥫ䁜;槅sub;柈Ŭᥴ᥾lĀ;e᥹᥺怢t»᥺pƀ;Eeįᦅᦇ;檮Ā;qۜۛೡᦧ\0᧨ᨑᨕᨲ\0ᨷᩐ\0\0᪴\0\0᫁\0\0ᬡᬮ᭍᭒\0᯽\0ᰌƀcpr᦭ᦲ᧝ute;䄇̀;abcdsᦿᧀᧄ᧊᧕᧙戩nd;橄rcup;橉Āau᧏᧒p;橋p;橇ot;橀;쀀∩︀Āeo᧢᧥t;恁îړȀaeiu᧰᧻ᨁᨅǰ᧵\0᧸s;橍on;䄍dil耻ç䃧rc;䄉psĀ;sᨌᨍ橌m;橐ot;䄋ƀdmnᨛᨠᨦil肻¸ƭptyv;榲t脀¢;eᨭᨮ䂢räƲr;쀀𝔠ƀceiᨽᩀᩍy;䑇ckĀ;mᩇᩈ朓ark»ᩈ;䏇r΀;Ecefms᩟᩠ᩢᩫ᪤᪪᪮旋;槃ƀ;elᩩᩪᩭ䋆q;扗eɡᩴ\0\0᪈rrowĀlr᩼᪁eft;憺ight;憻ʀRSacd᪒᪔᪖᪚᪟»ཇ;擈st;抛irc;抚ash;抝nint;樐id;櫯cir;槂ubsĀ;u᪻᪼晣it»᪼ˬ᫇᫔᫺\0ᬊonĀ;eᫍᫎ䀺Ā;qÇÆɭ᫙\0\0᫢aĀ;t᫞᫟䀬;䁀ƀ;fl᫨᫩᫫戁îᅠeĀmx᫱᫶ent»᫩eóɍǧ᫾\0ᬇĀ;dኻᬂot;橭nôɆƀfryᬐᬔᬗ;쀀𝕔oäɔ脀©;sŕᬝr;愗Āaoᬥᬩrr;憵ss;朗Ācuᬲᬷr;쀀𝒸Ābpᬼ᭄Ā;eᭁᭂ櫏;櫑Ā;eᭉᭊ櫐;櫒dot;拯΀delprvw᭠᭬᭷ᮂᮬᯔ᯹arrĀlr᭨᭪;椸;椵ɰ᭲\0\0᭵r;拞c;拟arrĀ;p᭿ᮀ憶;椽̀;bcdosᮏᮐᮖᮡᮥᮨ截rcap;橈Āauᮛᮞp;橆p;橊ot;抍r;橅;쀀∪︀Ȁalrv᮵ᮿᯞᯣrrĀ;mᮼᮽ憷;椼yƀevwᯇᯔᯘqɰᯎ\0\0ᯒreã᭳uã᭵ee;拎edge;拏en耻¤䂤earrowĀlrᯮ᯳eft»ᮀight»ᮽeäᯝĀciᰁᰇoninôǷnt;戱lcty;挭ঀAHabcdefhijlorstuwz᰸᰻᰿ᱝᱩᱵᲊᲞᲬᲷ᳻᳿ᴍᵻᶑᶫᶻ᷆᷍rò΁ar;楥Ȁglrs᱈ᱍ᱒᱔ger;怠eth;愸òᄳhĀ;vᱚᱛ怐»ऊūᱡᱧarow;椏aã̕Āayᱮᱳron;䄏;䐴ƀ;ao̲ᱼᲄĀgrʿᲁr;懊tseq;橷ƀglmᲑᲔᲘ耻°䂰ta;䎴ptyv;榱ĀirᲣᲨsht;楿;쀀𝔡arĀlrᲳᲵ»ࣜ»သʀaegsv᳂͸᳖᳜᳠mƀ;oș᳊᳔ndĀ;ș᳑uit;晦amma;䏝in;拲ƀ;io᳧᳨᳸䃷de脀÷;o᳧ᳰntimes;拇nø᳷cy;䑒cɯᴆ\0\0ᴊrn;挞op;挍ʀlptuwᴘᴝᴢᵉᵕlar;䀤f;쀀𝕕ʀ;emps̋ᴭᴷᴽᵂqĀ;d͒ᴳot;扑inus;戸lus;戔quare;抡blebarwedgåúnƀadhᄮᵝᵧownarrowóᲃarpoonĀlrᵲᵶefôᲴighôᲶŢᵿᶅkaro÷གɯᶊ\0\0ᶎrn;挟op;挌ƀcotᶘᶣᶦĀryᶝᶡ;쀀𝒹;䑕l;槶rok;䄑Ādrᶰᶴot;拱iĀ;fᶺ᠖斿Āah᷀᷃ròЩaòྦangle;榦Āci᷒ᷕy;䑟grarr;柿ऀDacdefglmnopqrstuxḁḉḙḸոḼṉṡṾấắẽỡἪἷὄ὎὚ĀDoḆᴴoôᲉĀcsḎḔute耻é䃩ter;橮ȀaioyḢḧḱḶron;䄛rĀ;cḭḮ扖耻ê䃪lon;払;䑍ot;䄗ĀDrṁṅot;扒;쀀𝔢ƀ;rsṐṑṗ檚ave耻è䃨Ā;dṜṝ檖ot;檘Ȁ;ilsṪṫṲṴ檙nters;揧;愓Ā;dṹṺ檕ot;檗ƀapsẅẉẗcr;䄓tyƀ;svẒẓẕ戅et»ẓpĀ1;ẝẤĳạả;怄;怅怃ĀgsẪẬ;䅋p;怂ĀgpẴẸon;䄙f;쀀𝕖ƀalsỄỎỒrĀ;sỊị拕l;槣us;橱iƀ;lvỚớở䎵on»ớ;䏵ȀcsuvỪỳἋἣĀioữḱrc»Ḯɩỹ\0\0ỻíՈantĀglἂἆtr»ṝess»Ṻƀaeiἒ἖Ἒls;䀽st;扟vĀ;DȵἠD;橸parsl;槥ĀDaἯἳot;打rr;楱ƀcdiἾὁỸr;愯oô͒ĀahὉὋ;䎷耻ð䃰Āmrὓὗl耻ë䃫o;悬ƀcipὡὤὧl;䀡sôծĀeoὬὴctatioîՙnentialåչৡᾒ\0ᾞ\0ᾡᾧ\0\0ῆῌ\0ΐ\0ῦῪ \0 ⁚llingdotseñṄy;䑄male;晀ƀilrᾭᾳ῁lig;耀ﬃɩᾹ\0\0᾽g;耀ﬀig;耀ﬄ;쀀𝔣lig;耀ﬁlig;쀀fjƀaltῙ῜ῡt;晭ig;耀ﬂns;斱of;䆒ǰ΅\0ῳf;쀀𝕗ĀakֿῷĀ;vῼ´拔;櫙artint;樍Āao‌⁕Ācs‑⁒α‚‰‸⁅⁈\0⁐β•‥‧‪‬\0‮耻½䂽;慓耻¼䂼;慕;慙;慛Ƴ‴\0‶;慔;慖ʴ‾⁁\0\0⁃耻¾䂾;慗;慜5;慘ƶ⁌\0⁎;慚;慝8;慞l;恄wn;挢cr;쀀𝒻ࢀEabcdefgijlnorstv₂₉₟₥₰₴⃰⃵⃺⃿℃ℒℸ̗ℾ⅒↞Ā;lٍ₇;檌ƀcmpₐₕ₝ute;䇵maĀ;dₜ᳚䎳;檆reve;䄟Āiy₪₮rc;䄝;䐳ot;䄡Ȁ;lqsؾق₽⃉ƀ;qsؾٌ⃄lanô٥Ȁ;cdl٥⃒⃥⃕c;檩otĀ;o⃜⃝檀Ā;l⃢⃣檂;檄Ā;e⃪⃭쀀⋛︀s;檔r;쀀𝔤Ā;gٳ؛mel;愷cy;䑓Ȁ;Eajٚℌℎℐ;檒;檥;檤ȀEaesℛℝ℩ℴ;扩pĀ;p℣ℤ檊rox»ℤĀ;q℮ℯ檈Ā;q℮ℛim;拧pf;쀀𝕘Āci⅃ⅆr;愊mƀ;el٫ⅎ⅐;檎;檐茀>;cdlqr׮ⅠⅪⅮⅳⅹĀciⅥⅧ;檧r;橺ot;拗Par;榕uest;橼ʀadelsↄⅪ←ٖ↛ǰ↉\0↎proø₞r;楸qĀlqؿ↖lesó₈ií٫Āen↣↭rtneqq;쀀≩︀Å↪ԀAabcefkosy⇄⇇⇱⇵⇺∘∝∯≨≽ròΠȀilmr⇐⇔⇗⇛rsðᒄf»․ilôکĀdr⇠⇤cy;䑊ƀ;cwࣴ⇫⇯ir;楈;憭ar;意irc;䄥ƀalr∁∎∓rtsĀ;u∉∊晥it»∊lip;怦con;抹r;쀀𝔥sĀew∣∩arow;椥arow;椦ʀamopr∺∾≃≞≣rr;懿tht;戻kĀlr≉≓eftarrow;憩ightarrow;憪f;쀀𝕙bar;怕ƀclt≯≴≸r;쀀𝒽asè⇴rok;䄧Ābp⊂⊇ull;恃hen»ᱛૡ⊣\0⊪\0⊸⋅⋎\0⋕⋳\0\0⋸⌢⍧⍢⍿\0⎆⎪⎴cute耻í䃭ƀ;iyݱ⊰⊵rc耻î䃮;䐸Ācx⊼⊿y;䐵cl耻¡䂡ĀfrΟ⋉;쀀𝔦rave耻ì䃬Ȁ;inoܾ⋝⋩⋮Āin⋢⋦nt;樌t;戭fin;槜ta;愩lig;䄳ƀaop⋾⌚⌝ƀcgt⌅⌈⌗r;䄫ƀelpܟ⌏⌓inåގarôܠh;䄱f;抷ed;䆵ʀ;cfotӴ⌬⌱⌽⍁are;愅inĀ;t⌸⌹戞ie;槝doô⌙ʀ;celpݗ⍌⍐⍛⍡al;抺Āgr⍕⍙eróᕣã⍍arhk;樗rod;樼Ȁcgpt⍯⍲⍶⍻y;䑑on;䄯f;쀀𝕚a;䎹uest耻¿䂿Āci⎊⎏r;쀀𝒾nʀ;EdsvӴ⎛⎝⎡ӳ;拹ot;拵Ā;v⎦⎧拴;拳Ā;iݷ⎮lde;䄩ǫ⎸\0⎼cy;䑖l耻ï䃯̀cfmosu⏌⏗⏜⏡⏧⏵Āiy⏑⏕rc;䄵;䐹r;쀀𝔧ath;䈷pf;쀀𝕛ǣ⏬\0⏱r;쀀𝒿rcy;䑘kcy;䑔Ѐacfghjos␋␖␢␧␭␱␵␻ppaĀ;v␓␔䎺;䏰Āey␛␠dil;䄷;䐺r;쀀𝔨reen;䄸cy;䑅cy;䑜pf;쀀𝕜cr;쀀𝓀஀ABEHabcdefghjlmnoprstuv⑰⒁⒆⒍⒑┎┽╚▀♎♞♥♹♽⚚⚲⛘❝❨➋⟀⠁⠒ƀart⑷⑺⑼rò৆òΕail;椛arr;椎Ā;gঔ⒋;檋ar;楢ॣ⒥\0⒪\0⒱\0\0\0\0\0⒵Ⓔ\0ⓆⓈⓍ\0⓹ute;䄺mptyv;榴raîࡌbda;䎻gƀ;dlࢎⓁⓃ;榑åࢎ;檅uo耻«䂫rЀ;bfhlpst࢙ⓞⓦⓩ⓫⓮⓱⓵Ā;f࢝ⓣs;椟s;椝ë≒p;憫l;椹im;楳l;憢ƀ;ae⓿─┄檫il;椙Ā;s┉┊檭;쀀⪭︀ƀabr┕┙┝rr;椌rk;杲Āak┢┬cĀek┨┪;䁻;䁛Āes┱┳;榋lĀdu┹┻;榏;榍Ȁaeuy╆╋╖╘ron;䄾Ādi═╔il;䄼ìࢰâ┩;䐻Ȁcqrs╣╦╭╽a;椶uoĀ;rนᝆĀdu╲╷har;楧shar;楋h;憲ʀ;fgqs▋▌উ◳◿扤tʀahlrt▘▤▷◂◨rrowĀ;t࢙□aé⓶arpoonĀdu▯▴own»њp»०eftarrows;懇ightƀahs◍◖◞rrowĀ;sࣴࢧarpoonó྘quigarro÷⇰hreetimes;拋ƀ;qs▋ও◺lanôবʀ;cdgsব☊☍☝☨c;檨otĀ;o☔☕橿Ā;r☚☛檁;檃Ā;e☢☥쀀⋚︀s;檓ʀadegs☳☹☽♉♋pproøⓆot;拖qĀgq♃♅ôউgtò⒌ôছiíলƀilr♕࣡♚sht;楼;쀀𝔩Ā;Eজ♣;檑š♩♶rĀdu▲♮Ā;l॥♳;楪lk;斄cy;䑙ʀ;achtੈ⚈⚋⚑⚖rò◁orneòᴈard;楫ri;旺Āio⚟⚤dot;䅀ustĀ;a⚬⚭掰che»⚭ȀEaes⚻⚽⛉⛔;扨pĀ;p⛃⛄檉rox»⛄Ā;q⛎⛏檇Ā;q⛎⚻im;拦Ѐabnoptwz⛩⛴⛷✚✯❁❇❐Ānr⛮⛱g;柬r;懽rëࣁgƀlmr⛿✍✔eftĀar০✇ightá৲apsto;柼ightá৽parrowĀlr✥✩efô⓭ight;憬ƀafl✶✹✽r;榅;쀀𝕝us;樭imes;樴š❋❏st;戗áፎƀ;ef❗❘᠀旊nge»❘arĀ;l❤❥䀨t;榓ʀachmt❳❶❼➅➇ròࢨorneòᶌarĀ;d྘➃;業;怎ri;抿̀achiqt➘➝ੀ➢➮➻quo;怹r;쀀𝓁mƀ;egল➪➬;檍;檏Ābu┪➳oĀ;rฟ➹;怚rok;䅂萀<;cdhilqrࠫ⟒☹⟜⟠⟥⟪⟰Āci⟗⟙;檦r;橹reå◲mes;拉arr;楶uest;橻ĀPi⟵⟹ar;榖ƀ;ef⠀भ᠛旃rĀdu⠇⠍shar;楊har;楦Āen⠗⠡rtneqq;쀀≨︀Å⠞܀Dacdefhilnopsu⡀⡅⢂⢎⢓⢠⢥⢨⣚⣢⣤ઃ⣳⤂Dot;戺Ȁclpr⡎⡒⡣⡽r耻¯䂯Āet⡗⡙;時Ā;e⡞⡟朠se»⡟Ā;sျ⡨toȀ;dluျ⡳⡷⡻owîҌefôएðᏑker;斮Āoy⢇⢌mma;権;䐼ash;怔asuredangle»ᘦr;쀀𝔪o;愧ƀcdn⢯⢴⣉ro耻µ䂵Ȁ;acdᑤ⢽⣀⣄sôᚧir;櫰ot肻·Ƶusƀ;bd⣒ᤃ⣓戒Ā;uᴼ⣘;横ţ⣞⣡p;櫛ò−ðઁĀdp⣩⣮els;抧f;쀀𝕞Āct⣸⣽r;쀀𝓂pos»ᖝƀ;lm⤉⤊⤍䎼timap;抸ఀGLRVabcdefghijlmoprstuvw⥂⥓⥾⦉⦘⧚⧩⨕⨚⩘⩝⪃⪕⪤⪨⬄⬇⭄⭿⮮ⰴⱧⱼ⳩Āgt⥇⥋;쀀⋙̸Ā;v⥐௏쀀≫⃒ƀelt⥚⥲⥶ftĀar⥡⥧rrow;懍ightarrow;懎;쀀⋘̸Ā;v⥻ే쀀≪⃒ightarrow;懏ĀDd⦎⦓ash;抯ash;抮ʀbcnpt⦣⦧⦬⦱⧌la»˞ute;䅄g;쀀∠⃒ʀ;Eiop඄⦼⧀⧅⧈;쀀⩰̸d;쀀≋̸s;䅉roø඄urĀ;a⧓⧔普lĀ;s⧓ସǳ⧟\0⧣p肻\xA0ଷmpĀ;e௹ఀʀaeouy⧴⧾⨃⨐⨓ǰ⧹\0⧻;橃on;䅈dil;䅆ngĀ;dൾ⨊ot;쀀⩭̸p;橂;䐽ash;怓΀;Aadqsxஒ⨩⨭⨻⩁⩅⩐rr;懗rĀhr⨳⨶k;椤Ā;oᏲᏰot;쀀≐̸uiöୣĀei⩊⩎ar;椨í஘istĀ;s஠டr;쀀𝔫ȀEest௅⩦⩹⩼ƀ;qs஼⩭௡ƀ;qs஼௅⩴lanô௢ií௪Ā;rஶ⪁»ஷƀAap⪊⪍⪑rò⥱rr;憮ar;櫲ƀ;svྍ⪜ྌĀ;d⪡⪢拼;拺cy;䑚΀AEadest⪷⪺⪾⫂⫅⫶⫹rò⥦;쀀≦̸rr;憚r;急Ȁ;fqs఻⫎⫣⫯tĀar⫔⫙rro÷⫁ightarro÷⪐ƀ;qs఻⪺⫪lanôౕĀ;sౕ⫴»శiíౝĀ;rవ⫾iĀ;eచథiäඐĀpt⬌⬑f;쀀𝕟膀¬;in⬙⬚⬶䂬nȀ;Edvஉ⬤⬨⬮;쀀⋹̸ot;쀀⋵̸ǡஉ⬳⬵;拷;拶iĀ;vಸ⬼ǡಸ⭁⭃;拾;拽ƀaor⭋⭣⭩rȀ;ast୻⭕⭚⭟lleì୻l;쀀⫽⃥;쀀∂̸lint;樔ƀ;ceಒ⭰⭳uåಥĀ;cಘ⭸Ā;eಒ⭽ñಘȀAait⮈⮋⮝⮧rò⦈rrƀ;cw⮔⮕⮙憛;쀀⤳̸;쀀↝̸ghtarrow»⮕riĀ;eೋೖ΀chimpqu⮽⯍⯙⬄୸⯤⯯Ȁ;cerല⯆ഷ⯉uå൅;쀀𝓃ortɭ⬅\0\0⯖ará⭖mĀ;e൮⯟Ā;q൴൳suĀbp⯫⯭å೸åഋƀbcp⯶ⰑⰙȀ;Ees⯿ⰀഢⰄ抄;쀀⫅̸etĀ;eഛⰋqĀ;qണⰀcĀ;eലⰗñസȀ;EesⰢⰣൟⰧ抅;쀀⫆̸etĀ;e൘ⰮqĀ;qൠⰣȀgilrⰽⰿⱅⱇìௗlde耻ñ䃱çృiangleĀlrⱒⱜeftĀ;eచⱚñదightĀ;eೋⱥñ೗Ā;mⱬⱭ䎽ƀ;esⱴⱵⱹ䀣ro;愖p;怇ҀDHadgilrsⲏⲔⲙⲞⲣⲰⲶⳓⳣash;抭arr;椄p;쀀≍⃒ash;抬ĀetⲨⲬ;쀀≥⃒;쀀>⃒nfin;槞ƀAetⲽⳁⳅrr;椂;쀀≤⃒Ā;rⳊⳍ쀀<⃒ie;쀀⊴⃒ĀAtⳘⳜrr;椃rie;쀀⊵⃒im;쀀∼⃒ƀAan⳰⳴ⴂrr;懖rĀhr⳺⳽k;椣Ā;oᏧᏥear;椧ቓ᪕\0\0\0\0\0\0\0\0\0\0\0\0\0ⴭ\0ⴸⵈⵠⵥ⵲ⶄᬇ\0\0ⶍⶫ\0ⷈⷎ\0ⷜ⸙⸫⸾⹃Ācsⴱ᪗ute耻ó䃳ĀiyⴼⵅrĀ;c᪞ⵂ耻ô䃴;䐾ʀabios᪠ⵒⵗǈⵚlac;䅑v;樸old;榼lig;䅓Ācr⵩⵭ir;榿;쀀𝔬ͯ⵹\0\0⵼\0ⶂn;䋛ave耻ò䃲;槁Ābmⶈ෴ar;榵Ȁacitⶕ⶘ⶥⶨrò᪀Āir⶝ⶠr;榾oss;榻nå๒;槀ƀaeiⶱⶵⶹcr;䅍ga;䏉ƀcdnⷀⷅǍron;䎿;榶pf;쀀𝕠ƀaelⷔ⷗ǒr;榷rp;榹΀;adiosvⷪⷫⷮ⸈⸍⸐⸖戨rò᪆Ȁ;efmⷷⷸ⸂⸅橝rĀ;oⷾⷿ愴f»ⷿ耻ª䂪耻º䂺gof;抶r;橖lope;橗;橛ƀclo⸟⸡⸧ò⸁ash耻ø䃸l;折iŬⸯ⸴de耻õ䃵esĀ;aǛ⸺s;樶ml耻ö䃶bar;挽ૡ⹞\0⹽\0⺀⺝\0⺢⺹\0\0⻋ຜ\0⼓\0\0⼫⾼\0⿈rȀ;astЃ⹧⹲຅脀¶;l⹭⹮䂶leìЃɩ⹸\0\0⹻m;櫳;櫽y;䐿rʀcimpt⺋⺏⺓ᡥ⺗nt;䀥od;䀮il;怰enk;怱r;쀀𝔭ƀimo⺨⺰⺴Ā;v⺭⺮䏆;䏕maô੶ne;明ƀ;tv⺿⻀⻈䏀chfork»´;䏖Āau⻏⻟nĀck⻕⻝kĀ;h⇴⻛;愎ö⇴sҀ;abcdemst⻳⻴ᤈ⻹⻽⼄⼆⼊⼎䀫cir;樣ir;樢Āouᵀ⼂;樥;橲n肻±ຝim;樦wo;樧ƀipu⼙⼠⼥ntint;樕f;쀀𝕡nd耻£䂣Ԁ;Eaceinosu່⼿⽁⽄⽇⾁⾉⾒⽾⾶;檳p;檷uå໙Ā;c໎⽌̀;acens່⽙⽟⽦⽨⽾pproø⽃urlyeñ໙ñ໎ƀaes⽯⽶⽺pprox;檹qq;檵im;拨iíໟmeĀ;s⾈ຮ怲ƀEas⽸⾐⽺ð⽵ƀdfp໬⾙⾯ƀals⾠⾥⾪lar;挮ine;挒urf;挓Ā;t໻⾴ï໻rel;抰Āci⿀⿅r;쀀𝓅;䏈ncsp;怈̀fiopsu⿚⋢⿟⿥⿫⿱r;쀀𝔮pf;쀀𝕢rime;恗cr;쀀𝓆ƀaeo⿸〉〓tĀei⿾々rnionóڰnt;樖stĀ;e【】䀿ñἙô༔઀ABHabcdefhilmnoprstux぀けさすムㄎㄫㅇㅢㅲㆎ㈆㈕㈤㈩㉘㉮㉲㊐㊰㊷ƀartぇおがròႳòϝail;検aròᱥar;楤΀cdenqrtとふへみわゔヌĀeuねぱ;쀀∽̱te;䅕iãᅮmptyv;榳gȀ;del࿑らるろ;榒;榥å࿑uo耻»䂻rր;abcfhlpstw࿜ガクシスゼゾダッデナp;極Ā;f࿠ゴs;椠;椳s;椞ë≝ð✮l;楅im;楴l;憣;憝Āaiパフil;椚oĀ;nホボ戶aló༞ƀabrョリヮrò៥rk;杳ĀakンヽcĀekヹ・;䁽;䁝Āes㄂㄄;榌lĀduㄊㄌ;榎;榐Ȁaeuyㄗㄜㄧㄩron;䅙Ādiㄡㄥil;䅗ì࿲âヺ;䑀Ȁclqsㄴㄷㄽㅄa;椷dhar;楩uoĀ;rȎȍh;憳ƀacgㅎㅟངlȀ;ipsླྀㅘㅛႜnåႻarôྩt;断ƀilrㅩဣㅮsht;楽;쀀𝔯ĀaoㅷㆆrĀduㅽㅿ»ѻĀ;l႑ㆄ;楬Ā;vㆋㆌ䏁;䏱ƀgns㆕ㇹㇼht̀ahlrstㆤㆰ㇂㇘㇤㇮rrowĀ;t࿜ㆭaéトarpoonĀduㆻㆿowîㅾp»႒eftĀah㇊㇐rrowó࿪arpoonóՑightarrows;應quigarro÷ニhreetimes;拌g;䋚ingdotseñἲƀahm㈍㈐㈓rò࿪aòՑ;怏oustĀ;a㈞㈟掱che»㈟mid;櫮Ȁabpt㈲㈽㉀㉒Ānr㈷㈺g;柭r;懾rëဃƀafl㉇㉊㉎r;榆;쀀𝕣us;樮imes;樵Āap㉝㉧rĀ;g㉣㉤䀩t;榔olint;樒arò㇣Ȁachq㉻㊀Ⴜ㊅quo;怺r;쀀𝓇Ābu・㊊oĀ;rȔȓƀhir㊗㊛㊠reåㇸmes;拊iȀ;efl㊪ၙᠡ㊫方tri;槎luhar;楨;愞ൡ㋕㋛㋟㌬㌸㍱\0㍺㎤\0\0㏬㏰\0㐨㑈㑚㒭㒱㓊㓱\0㘖\0\0㘳cute;䅛quï➺Ԁ;Eaceinpsyᇭ㋳㋵㋿㌂㌋㌏㌟㌦㌩;檴ǰ㋺\0㋼;檸on;䅡uåᇾĀ;dᇳ㌇il;䅟rc;䅝ƀEas㌖㌘㌛;檶p;檺im;择olint;樓iíሄ;䑁otƀ;be㌴ᵇ㌵担;橦΀Aacmstx㍆㍊㍗㍛㍞㍣㍭rr;懘rĀhr㍐㍒ë∨Ā;oਸ਼਴t耻§䂧i;䀻war;椩mĀin㍩ðnuóñt;朶rĀ;o㍶⁕쀀𝔰Ȁacoy㎂㎆㎑㎠rp;景Āhy㎋㎏cy;䑉;䑈rtɭ㎙\0\0㎜iäᑤaraì⹯耻­䂭Āgm㎨㎴maƀ;fv㎱㎲㎲䏃;䏂Ѐ;deglnprካ㏅㏉㏎㏖㏞㏡㏦ot;橪Ā;q኱ኰĀ;E㏓㏔檞;檠Ā;E㏛㏜檝;檟e;扆lus;樤arr;楲aròᄽȀaeit㏸㐈㐏㐗Āls㏽㐄lsetmé㍪hp;樳parsl;槤Ādlᑣ㐔e;挣Ā;e㐜㐝檪Ā;s㐢㐣檬;쀀⪬︀ƀflp㐮㐳㑂tcy;䑌Ā;b㐸㐹䀯Ā;a㐾㐿槄r;挿f;쀀𝕤aĀdr㑍ЂesĀ;u㑔㑕晠it»㑕ƀcsu㑠㑹㒟Āau㑥㑯pĀ;sᆈ㑫;쀀⊓︀pĀ;sᆴ㑵;쀀⊔︀uĀbp㑿㒏ƀ;esᆗᆜ㒆etĀ;eᆗ㒍ñᆝƀ;esᆨᆭ㒖etĀ;eᆨ㒝ñᆮƀ;afᅻ㒦ְrť㒫ֱ»ᅼaròᅈȀcemt㒹㒾㓂㓅r;쀀𝓈tmîñiì㐕aræᆾĀar㓎㓕rĀ;f㓔ឿ昆Āan㓚㓭ightĀep㓣㓪psiloîỠhé⺯s»⡒ʀbcmnp㓻㕞ሉ㖋㖎Ҁ;Edemnprs㔎㔏㔑㔕㔞㔣㔬㔱㔶抂;櫅ot;檽Ā;dᇚ㔚ot;櫃ult;櫁ĀEe㔨㔪;櫋;把lus;檿arr;楹ƀeiu㔽㕒㕕tƀ;en㔎㕅㕋qĀ;qᇚ㔏eqĀ;q㔫㔨m;櫇Ābp㕚㕜;櫕;櫓c̀;acensᇭ㕬㕲㕹㕻㌦pproø㋺urlyeñᇾñᇳƀaes㖂㖈㌛pproø㌚qñ㌗g;晪ڀ123;Edehlmnps㖩㖬㖯ሜ㖲㖴㗀㗉㗕㗚㗟㗨㗭耻¹䂹耻²䂲耻³䂳;櫆Āos㖹㖼t;檾ub;櫘Ā;dሢ㗅ot;櫄sĀou㗏㗒l;柉b;櫗arr;楻ult;櫂ĀEe㗤㗦;櫌;抋lus;櫀ƀeiu㗴㘉㘌tƀ;enሜ㗼㘂qĀ;qሢ㖲eqĀ;q㗧㗤m;櫈Ābp㘑㘓;櫔;櫖ƀAan㘜㘠㘭rr;懙rĀhr㘦㘨ë∮Ā;oਫ਩war;椪lig耻ß䃟௡㙑㙝㙠ዎ㙳㙹\0㙾㛂\0\0\0\0\0㛛㜃\0㜉㝬\0\0\0㞇ɲ㙖\0\0㙛get;挖;䏄rë๟ƀaey㙦㙫㙰ron;䅥dil;䅣;䑂lrec;挕r;쀀𝔱Ȁeiko㚆㚝㚵㚼ǲ㚋\0㚑eĀ4fኄኁaƀ;sv㚘㚙㚛䎸ym;䏑Ācn㚢㚲kĀas㚨㚮pproø዁im»ኬsðኞĀas㚺㚮ð዁rn耻þ䃾Ǭ̟㛆⋧es膀×;bd㛏㛐㛘䃗Ā;aᤏ㛕r;樱;樰ƀeps㛡㛣㜀á⩍Ȁ;bcf҆㛬㛰㛴ot;挶ir;櫱Ā;o㛹㛼쀀𝕥rk;櫚á㍢rime;怴ƀaip㜏㜒㝤dåቈ΀adempst㜡㝍㝀㝑㝗㝜㝟ngleʀ;dlqr㜰㜱㜶㝀㝂斵own»ᶻeftĀ;e⠀㜾ñम;扜ightĀ;e㊪㝋ñၚot;旬inus;樺lus;樹b;槍ime;樻ezium;揢ƀcht㝲㝽㞁Āry㝷㝻;쀀𝓉;䑆cy;䑛rok;䅧Āio㞋㞎xô᝷headĀlr㞗㞠eftarro÷ࡏightarrow»ཝऀAHabcdfghlmoprstuw㟐㟓㟗㟤㟰㟼㠎㠜㠣㠴㡑㡝㡫㢩㣌㣒㣪㣶ròϭar;楣Ācr㟜㟢ute耻ú䃺òᅐrǣ㟪\0㟭y;䑞ve;䅭Āiy㟵㟺rc耻û䃻;䑃ƀabh㠃㠆㠋ròᎭlac;䅱aòᏃĀir㠓㠘sht;楾;쀀𝔲rave耻ù䃹š㠧㠱rĀlr㠬㠮»ॗ»ႃlk;斀Āct㠹㡍ɯ㠿\0\0㡊rnĀ;e㡅㡆挜r»㡆op;挏ri;旸Āal㡖㡚cr;䅫肻¨͉Āgp㡢㡦on;䅳f;쀀𝕦̀adhlsuᅋ㡸㡽፲㢑㢠ownáᎳarpoonĀlr㢈㢌efô㠭ighô㠯iƀ;hl㢙㢚㢜䏅»ᏺon»㢚parrows;懈ƀcit㢰㣄㣈ɯ㢶\0\0㣁rnĀ;e㢼㢽挝r»㢽op;挎ng;䅯ri;旹cr;쀀𝓊ƀdir㣙㣝㣢ot;拰lde;䅩iĀ;f㜰㣨»᠓Āam㣯㣲rò㢨l耻ü䃼angle;榧ހABDacdeflnoprsz㤜㤟㤩㤭㦵㦸㦽㧟㧤㧨㧳㧹㧽㨁㨠ròϷarĀ;v㤦㤧櫨;櫩asèϡĀnr㤲㤷grt;榜΀eknprst㓣㥆㥋㥒㥝㥤㦖appá␕othinçẖƀhir㓫⻈㥙opô⾵Ā;hᎷ㥢ïㆍĀiu㥩㥭gmá㎳Ābp㥲㦄setneqĀ;q㥽㦀쀀⊊︀;쀀⫋︀setneqĀ;q㦏㦒쀀⊋︀;쀀⫌︀Āhr㦛㦟etá㚜iangleĀlr㦪㦯eft»थight»ၑy;䐲ash»ံƀelr㧄㧒㧗ƀ;beⷪ㧋㧏ar;抻q;扚lip;拮Ābt㧜ᑨaòᑩr;쀀𝔳tré㦮suĀbp㧯㧱»ജ»൙pf;쀀𝕧roð໻tré㦴Ācu㨆㨋r;쀀𝓋Ābp㨐㨘nĀEe㦀㨖»㥾nĀEe㦒㨞»㦐igzag;榚΀cefoprs㨶㨻㩖㩛㩔㩡㩪irc;䅵Ādi㩀㩑Ābg㩅㩉ar;機eĀ;qᗺ㩏;扙erp;愘r;쀀𝔴pf;쀀𝕨Ā;eᑹ㩦atèᑹcr;쀀𝓌ૣណ㪇\0㪋\0㪐㪛\0\0㪝㪨㪫㪯\0\0㫃㫎\0㫘ៜ៟tré៑r;쀀𝔵ĀAa㪔㪗ròσrò৶;䎾ĀAa㪡㪤ròθrò৫að✓is;拻ƀdptឤ㪵㪾Āfl㪺ឩ;쀀𝕩imåឲĀAa㫇㫊ròώròਁĀcq㫒ីr;쀀𝓍Āpt៖㫜ré។Ѐacefiosu㫰㫽㬈㬌㬑㬕㬛㬡cĀuy㫶㫻te耻ý䃽;䑏Āiy㬂㬆rc;䅷;䑋n耻¥䂥r;쀀𝔶cy;䑗pf;쀀𝕪cr;쀀𝓎Ācm㬦㬩y;䑎l耻ÿ䃿Ԁacdefhiosw㭂㭈㭔㭘㭤㭩㭭㭴㭺㮀cute;䅺Āay㭍㭒ron;䅾;䐷ot;䅼Āet㭝㭡træᕟa;䎶r;쀀𝔷cy;䐶grarr;懝pf;쀀𝕫cr;쀀𝓏Ājn㮅㮇;怍j;怌".split("").map((c) => c.charCodeAt(0)));

//#endregion
//#region ../../node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/esm/generated/decode-data-xml.js
var decode_data_xml_default = new Uint16Array("Ȁaglq	\x1Bɭ\0\0p;䀦os;䀧t;䀾t;䀼uot;䀢".split("").map((c) => c.charCodeAt(0)));

//#endregion
//#region ../../node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/esm/decode_codepoint.js
var _a;
const decodeMap = new Map([
	[0, 65533],
	[128, 8364],
	[130, 8218],
	[131, 402],
	[132, 8222],
	[133, 8230],
	[134, 8224],
	[135, 8225],
	[136, 710],
	[137, 8240],
	[138, 352],
	[139, 8249],
	[140, 338],
	[142, 381],
	[145, 8216],
	[146, 8217],
	[147, 8220],
	[148, 8221],
	[149, 8226],
	[150, 8211],
	[151, 8212],
	[152, 732],
	[153, 8482],
	[154, 353],
	[155, 8250],
	[156, 339],
	[158, 382],
	[159, 376]
]);
/**
* Polyfill for `String.fromCodePoint`. It is used to create a string from a Unicode code point.
*/
const fromCodePoint$1 = (_a = String.fromCodePoint) !== null && _a !== void 0 ? _a : function(codePoint) {
	let output = "";
	if (codePoint > 65535) {
		codePoint -= 65536;
		output += String.fromCharCode(codePoint >>> 10 & 1023 | 55296);
		codePoint = 56320 | codePoint & 1023;
	}
	output += String.fromCharCode(codePoint);
	return output;
};
/**
* Replace the given code point with a replacement character if it is a
* surrogate or is outside the valid range. Otherwise return the code
* point unchanged.
*/
function replaceCodePoint(codePoint) {
	var _a$1;
	if (codePoint >= 55296 && codePoint <= 57343 || codePoint > 1114111) return 65533;
	return (_a$1 = decodeMap.get(codePoint)) !== null && _a$1 !== void 0 ? _a$1 : codePoint;
}

//#endregion
//#region ../../node_modules/.pnpm/entities@4.5.0/node_modules/entities/lib/esm/decode.js
var CharCodes;
(function(CharCodes$1) {
	CharCodes$1[CharCodes$1["NUM"] = 35] = "NUM";
	CharCodes$1[CharCodes$1["SEMI"] = 59] = "SEMI";
	CharCodes$1[CharCodes$1["EQUALS"] = 61] = "EQUALS";
	CharCodes$1[CharCodes$1["ZERO"] = 48] = "ZERO";
	CharCodes$1[CharCodes$1["NINE"] = 57] = "NINE";
	CharCodes$1[CharCodes$1["LOWER_A"] = 97] = "LOWER_A";
	CharCodes$1[CharCodes$1["LOWER_F"] = 102] = "LOWER_F";
	CharCodes$1[CharCodes$1["LOWER_X"] = 120] = "LOWER_X";
	CharCodes$1[CharCodes$1["LOWER_Z"] = 122] = "LOWER_Z";
	CharCodes$1[CharCodes$1["UPPER_A"] = 65] = "UPPER_A";
	CharCodes$1[CharCodes$1["UPPER_F"] = 70] = "UPPER_F";
	CharCodes$1[CharCodes$1["UPPER_Z"] = 90] = "UPPER_Z";
})(CharCodes || (CharCodes = {}));
/** Bit that needs to be set to convert an upper case ASCII character to lower case */
const TO_LOWER_BIT = 32;
var BinTrieFlags;
(function(BinTrieFlags$1) {
	BinTrieFlags$1[BinTrieFlags$1["VALUE_LENGTH"] = 49152] = "VALUE_LENGTH";
	BinTrieFlags$1[BinTrieFlags$1["BRANCH_LENGTH"] = 16256] = "BRANCH_LENGTH";
	BinTrieFlags$1[BinTrieFlags$1["JUMP_TABLE"] = 127] = "JUMP_TABLE";
})(BinTrieFlags || (BinTrieFlags = {}));
function isNumber(code$1) {
	return code$1 >= CharCodes.ZERO && code$1 <= CharCodes.NINE;
}
function isHexadecimalCharacter(code$1) {
	return code$1 >= CharCodes.UPPER_A && code$1 <= CharCodes.UPPER_F || code$1 >= CharCodes.LOWER_A && code$1 <= CharCodes.LOWER_F;
}
function isAsciiAlphaNumeric(code$1) {
	return code$1 >= CharCodes.UPPER_A && code$1 <= CharCodes.UPPER_Z || code$1 >= CharCodes.LOWER_A && code$1 <= CharCodes.LOWER_Z || isNumber(code$1);
}
/**
* Checks if the given character is a valid end character for an entity in an attribute.
*
* Attribute values that aren't terminated properly aren't parsed, and shouldn't lead to a parser error.
* See the example in https://html.spec.whatwg.org/multipage/parsing.html#named-character-reference-state
*/
function isEntityInAttributeInvalidEnd(code$1) {
	return code$1 === CharCodes.EQUALS || isAsciiAlphaNumeric(code$1);
}
var EntityDecoderState;
(function(EntityDecoderState$1) {
	EntityDecoderState$1[EntityDecoderState$1["EntityStart"] = 0] = "EntityStart";
	EntityDecoderState$1[EntityDecoderState$1["NumericStart"] = 1] = "NumericStart";
	EntityDecoderState$1[EntityDecoderState$1["NumericDecimal"] = 2] = "NumericDecimal";
	EntityDecoderState$1[EntityDecoderState$1["NumericHex"] = 3] = "NumericHex";
	EntityDecoderState$1[EntityDecoderState$1["NamedEntity"] = 4] = "NamedEntity";
})(EntityDecoderState || (EntityDecoderState = {}));
var DecodingMode;
(function(DecodingMode$1) {
	/** Entities in text nodes that can end with any character. */
	DecodingMode$1[DecodingMode$1["Legacy"] = 0] = "Legacy";
	/** Only allow entities terminated with a semicolon. */
	DecodingMode$1[DecodingMode$1["Strict"] = 1] = "Strict";
	/** Entities in attributes have limitations on ending characters. */
	DecodingMode$1[DecodingMode$1["Attribute"] = 2] = "Attribute";
})(DecodingMode || (DecodingMode = {}));
/**
* Token decoder with support of writing partial entities.
*/
var EntityDecoder = class {
	constructor(decodeTree, emitCodePoint, errors$1) {
		this.decodeTree = decodeTree;
		this.emitCodePoint = emitCodePoint;
		this.errors = errors$1;
		/** The current state of the decoder. */
		this.state = EntityDecoderState.EntityStart;
		/** Characters that were consumed while parsing an entity. */
		this.consumed = 1;
		/**
		* The result of the entity.
		*
		* Either the result index of a numeric entity, or the codepoint of a
		* numeric entity.
		*/
		this.result = 0;
		/** The current index in the decode tree. */
		this.treeIndex = 0;
		/** The number of characters that were consumed in excess. */
		this.excess = 1;
		/** The mode in which the decoder is operating. */
		this.decodeMode = DecodingMode.Strict;
	}
	/** Resets the instance to make it reusable. */
	startEntity(decodeMode) {
		this.decodeMode = decodeMode;
		this.state = EntityDecoderState.EntityStart;
		this.result = 0;
		this.treeIndex = 0;
		this.excess = 1;
		this.consumed = 1;
	}
	/**
	* Write an entity to the decoder. This can be called multiple times with partial entities.
	* If the entity is incomplete, the decoder will return -1.
	*
	* Mirrors the implementation of `getDecoder`, but with the ability to stop decoding if the
	* entity is incomplete, and resume when the next string is written.
	*
	* @param string The string containing the entity (or a continuation of the entity).
	* @param offset The offset at which the entity begins. Should be 0 if this is not the first call.
	* @returns The number of characters that were consumed, or -1 if the entity is incomplete.
	*/
	write(str, offset) {
		switch (this.state) {
			case EntityDecoderState.EntityStart:
				if (str.charCodeAt(offset) === CharCodes.NUM) {
					this.state = EntityDecoderState.NumericStart;
					this.consumed += 1;
					return this.stateNumericStart(str, offset + 1);
				}
				this.state = EntityDecoderState.NamedEntity;
				return this.stateNamedEntity(str, offset);
			case EntityDecoderState.NumericStart: return this.stateNumericStart(str, offset);
			case EntityDecoderState.NumericDecimal: return this.stateNumericDecimal(str, offset);
			case EntityDecoderState.NumericHex: return this.stateNumericHex(str, offset);
			case EntityDecoderState.NamedEntity: return this.stateNamedEntity(str, offset);
		}
	}
	/**
	* Switches between the numeric decimal and hexadecimal states.
	*
	* Equivalent to the `Numeric character reference state` in the HTML spec.
	*
	* @param str The string containing the entity (or a continuation of the entity).
	* @param offset The current offset.
	* @returns The number of characters that were consumed, or -1 if the entity is incomplete.
	*/
	stateNumericStart(str, offset) {
		if (offset >= str.length) return -1;
		if ((str.charCodeAt(offset) | TO_LOWER_BIT) === CharCodes.LOWER_X) {
			this.state = EntityDecoderState.NumericHex;
			this.consumed += 1;
			return this.stateNumericHex(str, offset + 1);
		}
		this.state = EntityDecoderState.NumericDecimal;
		return this.stateNumericDecimal(str, offset);
	}
	addToNumericResult(str, start, end, base$1) {
		if (start !== end) {
			const digitCount = end - start;
			this.result = this.result * Math.pow(base$1, digitCount) + parseInt(str.substr(start, digitCount), base$1);
			this.consumed += digitCount;
		}
	}
	/**
	* Parses a hexadecimal numeric entity.
	*
	* Equivalent to the `Hexademical character reference state` in the HTML spec.
	*
	* @param str The string containing the entity (or a continuation of the entity).
	* @param offset The current offset.
	* @returns The number of characters that were consumed, or -1 if the entity is incomplete.
	*/
	stateNumericHex(str, offset) {
		const startIdx = offset;
		while (offset < str.length) {
			const char = str.charCodeAt(offset);
			if (isNumber(char) || isHexadecimalCharacter(char)) offset += 1;
			else {
				this.addToNumericResult(str, startIdx, offset, 16);
				return this.emitNumericEntity(char, 3);
			}
		}
		this.addToNumericResult(str, startIdx, offset, 16);
		return -1;
	}
	/**
	* Parses a decimal numeric entity.
	*
	* Equivalent to the `Decimal character reference state` in the HTML spec.
	*
	* @param str The string containing the entity (or a continuation of the entity).
	* @param offset The current offset.
	* @returns The number of characters that were consumed, or -1 if the entity is incomplete.
	*/
	stateNumericDecimal(str, offset) {
		const startIdx = offset;
		while (offset < str.length) {
			const char = str.charCodeAt(offset);
			if (isNumber(char)) offset += 1;
			else {
				this.addToNumericResult(str, startIdx, offset, 10);
				return this.emitNumericEntity(char, 2);
			}
		}
		this.addToNumericResult(str, startIdx, offset, 10);
		return -1;
	}
	/**
	* Validate and emit a numeric entity.
	*
	* Implements the logic from the `Hexademical character reference start
	* state` and `Numeric character reference end state` in the HTML spec.
	*
	* @param lastCp The last code point of the entity. Used to see if the
	*               entity was terminated with a semicolon.
	* @param expectedLength The minimum number of characters that should be
	*                       consumed. Used to validate that at least one digit
	*                       was consumed.
	* @returns The number of characters that were consumed.
	*/
	emitNumericEntity(lastCp, expectedLength) {
		var _a$1;
		if (this.consumed <= expectedLength) {
			(_a$1 = this.errors) === null || _a$1 === void 0 || _a$1.absenceOfDigitsInNumericCharacterReference(this.consumed);
			return 0;
		}
		if (lastCp === CharCodes.SEMI) this.consumed += 1;
		else if (this.decodeMode === DecodingMode.Strict) return 0;
		this.emitCodePoint(replaceCodePoint(this.result), this.consumed);
		if (this.errors) {
			if (lastCp !== CharCodes.SEMI) this.errors.missingSemicolonAfterCharacterReference();
			this.errors.validateNumericCharacterReference(this.result);
		}
		return this.consumed;
	}
	/**
	* Parses a named entity.
	*
	* Equivalent to the `Named character reference state` in the HTML spec.
	*
	* @param str The string containing the entity (or a continuation of the entity).
	* @param offset The current offset.
	* @returns The number of characters that were consumed, or -1 if the entity is incomplete.
	*/
	stateNamedEntity(str, offset) {
		const { decodeTree } = this;
		let current = decodeTree[this.treeIndex];
		let valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
		for (; offset < str.length; offset++, this.excess++) {
			const char = str.charCodeAt(offset);
			this.treeIndex = determineBranch(decodeTree, current, this.treeIndex + Math.max(1, valueLength), char);
			if (this.treeIndex < 0) return this.result === 0 || this.decodeMode === DecodingMode.Attribute && (valueLength === 0 || isEntityInAttributeInvalidEnd(char)) ? 0 : this.emitNotTerminatedNamedEntity();
			current = decodeTree[this.treeIndex];
			valueLength = (current & BinTrieFlags.VALUE_LENGTH) >> 14;
			if (valueLength !== 0) {
				if (char === CharCodes.SEMI) return this.emitNamedEntityData(this.treeIndex, valueLength, this.consumed + this.excess);
				if (this.decodeMode !== DecodingMode.Strict) {
					this.result = this.treeIndex;
					this.consumed += this.excess;
					this.excess = 0;
				}
			}
		}
		return -1;
	}
	/**
	* Emit a named entity that was not terminated with a semicolon.
	*
	* @returns The number of characters consumed.
	*/
	emitNotTerminatedNamedEntity() {
		var _a$1;
		const { result, decodeTree } = this;
		const valueLength = (decodeTree[result] & BinTrieFlags.VALUE_LENGTH) >> 14;
		this.emitNamedEntityData(result, valueLength, this.consumed);
		(_a$1 = this.errors) === null || _a$1 === void 0 || _a$1.missingSemicolonAfterCharacterReference();
		return this.consumed;
	}
	/**
	* Emit a named entity.
	*
	* @param result The index of the entity in the decode tree.
	* @param valueLength The number of bytes in the entity.
	* @param consumed The number of characters consumed.
	*
	* @returns The number of characters consumed.
	*/
	emitNamedEntityData(result, valueLength, consumed) {
		const { decodeTree } = this;
		this.emitCodePoint(valueLength === 1 ? decodeTree[result] & ~BinTrieFlags.VALUE_LENGTH : decodeTree[result + 1], consumed);
		if (valueLength === 3) this.emitCodePoint(decodeTree[result + 2], consumed);
		return consumed;
	}
	/**
	* Signal to the parser that the end of the input was reached.
	*
	* Remaining data will be emitted and relevant errors will be produced.
	*
	* @returns The number of characters consumed.
	*/
	end() {
		var _a$1;
		switch (this.state) {
			case EntityDecoderState.NamedEntity: return this.result !== 0 && (this.decodeMode !== DecodingMode.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
			case EntityDecoderState.NumericDecimal: return this.emitNumericEntity(0, 2);
			case EntityDecoderState.NumericHex: return this.emitNumericEntity(0, 3);
			case EntityDecoderState.NumericStart:
				(_a$1 = this.errors) === null || _a$1 === void 0 || _a$1.absenceOfDigitsInNumericCharacterReference(this.consumed);
				return 0;
			case EntityDecoderState.EntityStart: return 0;
		}
	}
};
/**
* Creates a function that decodes entities in a string.
*
* @param decodeTree The decode tree.
* @returns A function that decodes entities in a string.
*/
function getDecoder(decodeTree) {
	let ret = "";
	const decoder = new EntityDecoder(decodeTree, (str) => ret += fromCodePoint$1(str));
	return function decodeWithTrie(str, decodeMode) {
		let lastIndex = 0;
		let offset = 0;
		while ((offset = str.indexOf("&", offset)) >= 0) {
			ret += str.slice(lastIndex, offset);
			decoder.startEntity(decodeMode);
			const len = decoder.write(str, offset + 1);
			if (len < 0) {
				lastIndex = offset + decoder.end();
				break;
			}
			lastIndex = offset + len;
			offset = len === 0 ? lastIndex + 1 : lastIndex;
		}
		const result = ret + str.slice(lastIndex);
		ret = "";
		return result;
	};
}
/**
* Determines the branch of the current node that is taken given the current
* character. This function is used to traverse the trie.
*
* @param decodeTree The trie.
* @param current The current node.
* @param nodeIdx The index right after the current node and its value.
* @param char The current character.
* @returns The index of the next node, or -1 if no branch is taken.
*/
function determineBranch(decodeTree, current, nodeIdx, char) {
	const branchCount = (current & BinTrieFlags.BRANCH_LENGTH) >> 7;
	const jumpOffset = current & BinTrieFlags.JUMP_TABLE;
	if (branchCount === 0) return jumpOffset !== 0 && char === jumpOffset ? nodeIdx : -1;
	if (jumpOffset) {
		const value = char - jumpOffset;
		return value < 0 || value >= branchCount ? -1 : decodeTree[nodeIdx + value] - 1;
	}
	let lo = nodeIdx;
	let hi = lo + branchCount - 1;
	while (lo <= hi) {
		const mid = lo + hi >>> 1;
		const midVal = decodeTree[mid];
		if (midVal < char) lo = mid + 1;
		else if (midVal > char) hi = mid - 1;
		else return decodeTree[mid + branchCount];
	}
	return -1;
}
const htmlDecoder = getDecoder(decode_data_html_default);
const xmlDecoder = getDecoder(decode_data_xml_default);
/**
* Decodes an HTML string.
*
* @param str The string to decode.
* @param mode The decoding mode.
* @returns The decoded string.
*/
function decodeHTML(str, mode = DecodingMode.Legacy) {
	return htmlDecoder(str, mode);
}

//#endregion
//#region ../../node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/lib/decode.mjs
var import_markdown_it_task_checkbox = /* @__PURE__ */ __toESM(require_markdown_it_task_checkbox(), 1);
const decodeCache = {};
function getDecodeCache(exclude) {
	let cache = decodeCache[exclude];
	if (cache) return cache;
	cache = decodeCache[exclude] = [];
	for (let i = 0; i < 128; i++) {
		const ch = String.fromCharCode(i);
		cache.push(ch);
	}
	for (let i = 0; i < exclude.length; i++) {
		const ch = exclude.charCodeAt(i);
		cache[ch] = "%" + ("0" + ch.toString(16).toUpperCase()).slice(-2);
	}
	return cache;
}
function decode$1(string, exclude) {
	if (typeof exclude !== "string") exclude = decode$1.defaultChars;
	const cache = getDecodeCache(exclude);
	return string.replace(/(%[a-f0-9]{2})+/gi, function(seq) {
		let result = "";
		for (let i = 0, l = seq.length; i < l; i += 3) {
			const b1 = parseInt(seq.slice(i + 1, i + 3), 16);
			if (b1 < 128) {
				result += cache[b1];
				continue;
			}
			if ((b1 & 224) === 192 && i + 3 < l) {
				const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
				if ((b2 & 192) === 128) {
					const chr = b1 << 6 & 1984 | b2 & 63;
					if (chr < 128) result += "��";
					else result += String.fromCharCode(chr);
					i += 3;
					continue;
				}
			}
			if ((b1 & 240) === 224 && i + 6 < l) {
				const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
				const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
				if ((b2 & 192) === 128 && (b3 & 192) === 128) {
					const chr = b1 << 12 & 61440 | b2 << 6 & 4032 | b3 & 63;
					if (chr < 2048 || chr >= 55296 && chr <= 57343) result += "���";
					else result += String.fromCharCode(chr);
					i += 6;
					continue;
				}
			}
			if ((b1 & 248) === 240 && i + 9 < l) {
				const b2 = parseInt(seq.slice(i + 4, i + 6), 16);
				const b3 = parseInt(seq.slice(i + 7, i + 9), 16);
				const b4 = parseInt(seq.slice(i + 10, i + 12), 16);
				if ((b2 & 192) === 128 && (b3 & 192) === 128 && (b4 & 192) === 128) {
					let chr = b1 << 18 & 1835008 | b2 << 12 & 258048 | b3 << 6 & 4032 | b4 & 63;
					if (chr < 65536 || chr > 1114111) result += "����";
					else {
						chr -= 65536;
						result += String.fromCharCode(55296 + (chr >> 10), 56320 + (chr & 1023));
					}
					i += 9;
					continue;
				}
			}
			result += "�";
		}
		return result;
	});
}
decode$1.defaultChars = ";/?:@&=+$,#";
decode$1.componentChars = "";
var decode_default = decode$1;

//#endregion
//#region ../../node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/lib/encode.mjs
const encodeCache = {};
function getEncodeCache(exclude) {
	let cache = encodeCache[exclude];
	if (cache) return cache;
	cache = encodeCache[exclude] = [];
	for (let i = 0; i < 128; i++) {
		const ch = String.fromCharCode(i);
		if (/^[0-9a-z]$/i.test(ch)) cache.push(ch);
		else cache.push("%" + ("0" + i.toString(16).toUpperCase()).slice(-2));
	}
	for (let i = 0; i < exclude.length; i++) cache[exclude.charCodeAt(i)] = exclude[i];
	return cache;
}
function encode$1(string, exclude, keepEscaped) {
	if (typeof exclude !== "string") {
		keepEscaped = exclude;
		exclude = encode$1.defaultChars;
	}
	if (typeof keepEscaped === "undefined") keepEscaped = true;
	const cache = getEncodeCache(exclude);
	let result = "";
	for (let i = 0, l = string.length; i < l; i++) {
		const code$1 = string.charCodeAt(i);
		if (keepEscaped && code$1 === 37 && i + 2 < l) {
			if (/^[0-9a-f]{2}$/i.test(string.slice(i + 1, i + 3))) {
				result += string.slice(i, i + 3);
				i += 2;
				continue;
			}
		}
		if (code$1 < 128) {
			result += cache[code$1];
			continue;
		}
		if (code$1 >= 55296 && code$1 <= 57343) {
			if (code$1 >= 55296 && code$1 <= 56319 && i + 1 < l) {
				const nextCode = string.charCodeAt(i + 1);
				if (nextCode >= 56320 && nextCode <= 57343) {
					result += encodeURIComponent(string[i] + string[i + 1]);
					i++;
					continue;
				}
			}
			result += "%EF%BF%BD";
			continue;
		}
		result += encodeURIComponent(string[i]);
	}
	return result;
}
encode$1.defaultChars = ";/?:@&=+$,-_.!~*'()#";
encode$1.componentChars = "-_.!~*'()";
var encode_default = encode$1;

//#endregion
//#region ../../node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/lib/format.mjs
function format(url) {
	let result = "";
	result += url.protocol || "";
	result += url.slashes ? "//" : "";
	result += url.auth ? url.auth + "@" : "";
	if (url.hostname && url.hostname.indexOf(":") !== -1) result += "[" + url.hostname + "]";
	else result += url.hostname || "";
	result += url.port ? ":" + url.port : "";
	result += url.pathname || "";
	result += url.search || "";
	result += url.hash || "";
	return result;
}

//#endregion
//#region ../../node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/lib/parse.mjs
function Url() {
	this.protocol = null;
	this.slashes = null;
	this.auth = null;
	this.port = null;
	this.hostname = null;
	this.hash = null;
	this.search = null;
	this.pathname = null;
}
const protocolPattern = /^([a-z0-9.+-]+:)/i;
const portPattern = /:[0-9]*$/;
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/;
const unwise = [
	"{",
	"}",
	"|",
	"\\",
	"^",
	"`"
].concat([
	"<",
	">",
	"\"",
	"`",
	" ",
	"\r",
	"\n",
	"	"
]);
const autoEscape = ["'"].concat(unwise);
const nonHostChars = [
	"%",
	"/",
	"?",
	";",
	"#"
].concat(autoEscape);
const hostEndingChars = [
	"/",
	"?",
	"#"
];
const hostnameMaxLen = 255;
const hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/;
const hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/;
const hostlessProtocol = {
	javascript: true,
	"javascript:": true
};
const slashedProtocol = {
	http: true,
	https: true,
	ftp: true,
	gopher: true,
	file: true,
	"http:": true,
	"https:": true,
	"ftp:": true,
	"gopher:": true,
	"file:": true
};
function urlParse(url, slashesDenoteHost) {
	if (url && url instanceof Url) return url;
	const u = new Url();
	u.parse(url, slashesDenoteHost);
	return u;
}
Url.prototype.parse = function(url, slashesDenoteHost) {
	let lowerProto, hec, slashes;
	let rest = url;
	rest = rest.trim();
	if (!slashesDenoteHost && url.split("#").length === 1) {
		const simplePath = simplePathPattern.exec(rest);
		if (simplePath) {
			this.pathname = simplePath[1];
			if (simplePath[2]) this.search = simplePath[2];
			return this;
		}
	}
	let proto = protocolPattern.exec(rest);
	if (proto) {
		proto = proto[0];
		lowerProto = proto.toLowerCase();
		this.protocol = proto;
		rest = rest.substr(proto.length);
	}
	if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
		slashes = rest.substr(0, 2) === "//";
		if (slashes && !(proto && hostlessProtocol[proto])) {
			rest = rest.substr(2);
			this.slashes = true;
		}
	}
	if (!hostlessProtocol[proto] && (slashes || proto && !slashedProtocol[proto])) {
		let hostEnd = -1;
		for (let i = 0; i < hostEndingChars.length; i++) {
			hec = rest.indexOf(hostEndingChars[i]);
			if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) hostEnd = hec;
		}
		let auth, atSign;
		if (hostEnd === -1) atSign = rest.lastIndexOf("@");
		else atSign = rest.lastIndexOf("@", hostEnd);
		if (atSign !== -1) {
			auth = rest.slice(0, atSign);
			rest = rest.slice(atSign + 1);
			this.auth = auth;
		}
		hostEnd = -1;
		for (let i = 0; i < nonHostChars.length; i++) {
			hec = rest.indexOf(nonHostChars[i]);
			if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) hostEnd = hec;
		}
		if (hostEnd === -1) hostEnd = rest.length;
		if (rest[hostEnd - 1] === ":") hostEnd--;
		const host = rest.slice(0, hostEnd);
		rest = rest.slice(hostEnd);
		this.parseHost(host);
		this.hostname = this.hostname || "";
		const ipv6Hostname = this.hostname[0] === "[" && this.hostname[this.hostname.length - 1] === "]";
		if (!ipv6Hostname) {
			const hostparts = this.hostname.split(/\./);
			for (let i = 0, l = hostparts.length; i < l; i++) {
				const part = hostparts[i];
				if (!part) continue;
				if (!part.match(hostnamePartPattern)) {
					let newpart = "";
					for (let j = 0, k = part.length; j < k; j++) if (part.charCodeAt(j) > 127) newpart += "x";
					else newpart += part[j];
					if (!newpart.match(hostnamePartPattern)) {
						const validParts = hostparts.slice(0, i);
						const notHost = hostparts.slice(i + 1);
						const bit = part.match(hostnamePartStart);
						if (bit) {
							validParts.push(bit[1]);
							notHost.unshift(bit[2]);
						}
						if (notHost.length) rest = notHost.join(".") + rest;
						this.hostname = validParts.join(".");
						break;
					}
				}
			}
		}
		if (this.hostname.length > hostnameMaxLen) this.hostname = "";
		if (ipv6Hostname) this.hostname = this.hostname.substr(1, this.hostname.length - 2);
	}
	const hash = rest.indexOf("#");
	if (hash !== -1) {
		this.hash = rest.substr(hash);
		rest = rest.slice(0, hash);
	}
	const qm = rest.indexOf("?");
	if (qm !== -1) {
		this.search = rest.substr(qm);
		rest = rest.slice(0, qm);
	}
	if (rest) this.pathname = rest;
	if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) this.pathname = "";
	return this;
};
Url.prototype.parseHost = function(host) {
	let port = portPattern.exec(host);
	if (port) {
		port = port[0];
		if (port !== ":") this.port = port.substr(1);
		host = host.substr(0, host.length - port.length);
	}
	if (host) this.hostname = host;
};
var parse_default = urlParse;

//#endregion
//#region ../../node_modules/.pnpm/mdurl@2.0.0/node_modules/mdurl/index.mjs
var mdurl_exports = /* @__PURE__ */ __export$1({
	decode: () => decode_default,
	encode: () => encode_default,
	format: () => format,
	parse: () => parse_default
});

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/properties/Any/regex.mjs
var regex_default = /[\0-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/categories/Cc/regex.mjs
var regex_default$1 = /[\0-\x1F\x7F-\x9F]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/categories/Cf/regex.mjs
var regex_default$4 = /[\xAD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]|\uD804[\uDCBD\uDCCD]|\uD80D[\uDC30-\uDC3F]|\uD82F[\uDCA0-\uDCA3]|\uD834[\uDD73-\uDD7A]|\uDB40[\uDC01\uDC20-\uDC7F]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/categories/P/regex.mjs
var regex_default$3 = /[!-#%-\*,-\/:;\?@\[-\]_\{\}\xA1\xA7\xAB\xB6\xB7\xBB\xBF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061D-\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u09FD\u0A76\u0AF0\u0C77\u0C84\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1B7D\u1B7E\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2308-\u230B\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E4F\u2E52-\u2E5D\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA8FC\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]|\uD800[\uDD00-\uDD02\uDF9F\uDFD0]|\uD801\uDD6F|\uD802[\uDC57\uDD1F\uDD3F\uDE50-\uDE58\uDE7F\uDEF0-\uDEF6\uDF39-\uDF3F\uDF99-\uDF9C]|\uD803[\uDEAD\uDF55-\uDF59\uDF86-\uDF89]|\uD804[\uDC47-\uDC4D\uDCBB\uDCBC\uDCBE-\uDCC1\uDD40-\uDD43\uDD74\uDD75\uDDC5-\uDDC8\uDDCD\uDDDB\uDDDD-\uDDDF\uDE38-\uDE3D\uDEA9]|\uD805[\uDC4B-\uDC4F\uDC5A\uDC5B\uDC5D\uDCC6\uDDC1-\uDDD7\uDE41-\uDE43\uDE60-\uDE6C\uDEB9\uDF3C-\uDF3E]|\uD806[\uDC3B\uDD44-\uDD46\uDDE2\uDE3F-\uDE46\uDE9A-\uDE9C\uDE9E-\uDEA2\uDF00-\uDF09]|\uD807[\uDC41-\uDC45\uDC70\uDC71\uDEF7\uDEF8\uDF43-\uDF4F\uDFFF]|\uD809[\uDC70-\uDC74]|\uD80B[\uDFF1\uDFF2]|\uD81A[\uDE6E\uDE6F\uDEF5\uDF37-\uDF3B\uDF44]|\uD81B[\uDE97-\uDE9A\uDFE2]|\uD82F\uDC9F|\uD836[\uDE87-\uDE8B]|\uD83A[\uDD5E\uDD5F]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/categories/S/regex.mjs
var regex_default$5 = /[\$\+<->\^`\|~\xA2-\xA6\xA8\xA9\xAC\xAE-\xB1\xB4\xB8\xD7\xF7\u02C2-\u02C5\u02D2-\u02DF\u02E5-\u02EB\u02ED\u02EF-\u02FF\u0375\u0384\u0385\u03F6\u0482\u058D-\u058F\u0606-\u0608\u060B\u060E\u060F\u06DE\u06E9\u06FD\u06FE\u07F6\u07FE\u07FF\u0888\u09F2\u09F3\u09FA\u09FB\u0AF1\u0B70\u0BF3-\u0BFA\u0C7F\u0D4F\u0D79\u0E3F\u0F01-\u0F03\u0F13\u0F15-\u0F17\u0F1A-\u0F1F\u0F34\u0F36\u0F38\u0FBE-\u0FC5\u0FC7-\u0FCC\u0FCE\u0FCF\u0FD5-\u0FD8\u109E\u109F\u1390-\u1399\u166D\u17DB\u1940\u19DE-\u19FF\u1B61-\u1B6A\u1B74-\u1B7C\u1FBD\u1FBF-\u1FC1\u1FCD-\u1FCF\u1FDD-\u1FDF\u1FED-\u1FEF\u1FFD\u1FFE\u2044\u2052\u207A-\u207C\u208A-\u208C\u20A0-\u20C0\u2100\u2101\u2103-\u2106\u2108\u2109\u2114\u2116-\u2118\u211E-\u2123\u2125\u2127\u2129\u212E\u213A\u213B\u2140-\u2144\u214A-\u214D\u214F\u218A\u218B\u2190-\u2307\u230C-\u2328\u232B-\u2426\u2440-\u244A\u249C-\u24E9\u2500-\u2767\u2794-\u27C4\u27C7-\u27E5\u27F0-\u2982\u2999-\u29D7\u29DC-\u29FB\u29FE-\u2B73\u2B76-\u2B95\u2B97-\u2BFF\u2CE5-\u2CEA\u2E50\u2E51\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFF\u3004\u3012\u3013\u3020\u3036\u3037\u303E\u303F\u309B\u309C\u3190\u3191\u3196-\u319F\u31C0-\u31E3\u31EF\u3200-\u321E\u322A-\u3247\u3250\u3260-\u327F\u328A-\u32B0\u32C0-\u33FF\u4DC0-\u4DFF\uA490-\uA4C6\uA700-\uA716\uA720\uA721\uA789\uA78A\uA828-\uA82B\uA836-\uA839\uAA77-\uAA79\uAB5B\uAB6A\uAB6B\uFB29\uFBB2-\uFBC2\uFD40-\uFD4F\uFDCF\uFDFC-\uFDFF\uFE62\uFE64-\uFE66\uFE69\uFF04\uFF0B\uFF1C-\uFF1E\uFF3E\uFF40\uFF5C\uFF5E\uFFE0-\uFFE6\uFFE8-\uFFEE\uFFFC\uFFFD]|\uD800[\uDD37-\uDD3F\uDD79-\uDD89\uDD8C-\uDD8E\uDD90-\uDD9C\uDDA0\uDDD0-\uDDFC]|\uD802[\uDC77\uDC78\uDEC8]|\uD805\uDF3F|\uD807[\uDFD5-\uDFF1]|\uD81A[\uDF3C-\uDF3F\uDF45]|\uD82F\uDC9C|\uD833[\uDF50-\uDFC3]|\uD834[\uDC00-\uDCF5\uDD00-\uDD26\uDD29-\uDD64\uDD6A-\uDD6C\uDD83\uDD84\uDD8C-\uDDA9\uDDAE-\uDDEA\uDE00-\uDE41\uDE45\uDF00-\uDF56]|\uD835[\uDEC1\uDEDB\uDEFB\uDF15\uDF35\uDF4F\uDF6F\uDF89\uDFA9\uDFC3]|\uD836[\uDC00-\uDDFF\uDE37-\uDE3A\uDE6D-\uDE74\uDE76-\uDE83\uDE85\uDE86]|\uD838[\uDD4F\uDEFF]|\uD83B[\uDCAC\uDCB0\uDD2E\uDEF0\uDEF1]|\uD83C[\uDC00-\uDC2B\uDC30-\uDC93\uDCA0-\uDCAE\uDCB1-\uDCBF\uDCC1-\uDCCF\uDCD1-\uDCF5\uDD0D-\uDDAD\uDDE6-\uDE02\uDE10-\uDE3B\uDE40-\uDE48\uDE50\uDE51\uDE60-\uDE65\uDF00-\uDFFF]|\uD83D[\uDC00-\uDED7\uDEDC-\uDEEC\uDEF0-\uDEFC\uDF00-\uDF76\uDF7B-\uDFD9\uDFE0-\uDFEB\uDFF0]|\uD83E[\uDC00-\uDC0B\uDC10-\uDC47\uDC50-\uDC59\uDC60-\uDC87\uDC90-\uDCAD\uDCB0\uDCB1\uDD00-\uDE53\uDE60-\uDE6D\uDE70-\uDE7C\uDE80-\uDE88\uDE90-\uDEBD\uDEBF-\uDEC5\uDECE-\uDEDB\uDEE0-\uDEE8\uDEF0-\uDEF8\uDF00-\uDF92\uDF94-\uDFCA]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/categories/Z/regex.mjs
var regex_default$2 = /[ \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

//#endregion
//#region ../../node_modules/.pnpm/uc.micro@2.1.0/node_modules/uc.micro/index.mjs
var uc_exports = /* @__PURE__ */ __export$1({
	Any: () => regex_default,
	Cc: () => regex_default$1,
	Cf: () => regex_default$4,
	P: () => regex_default$3,
	S: () => regex_default$5,
	Z: () => regex_default$2
});

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-ts@1.0.0/node_modules/markdown-it-ts/dist/strategy_diagnostics-Bwt8UKDw.js
var __defProp = Object.defineProperty;
var __export = (all) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	return target;
};
var utils_exports = /* @__PURE__ */ __export({
	arrayReplaceAt: () => arrayReplaceAt,
	assign: () => assign$1,
	countLines: () => countLines,
	escapeHtml: () => escapeHtml$3,
	escapeRE: () => escapeRE$1,
	fromCodePoint: () => fromCodePoint,
	has: () => has,
	isMdAsciiPunct: () => isMdAsciiPunct,
	isPunctChar: () => isPunctChar,
	isPunctCode: () => isPunctCode,
	isSpace: () => isSpace$8,
	isString: () => isString$1,
	isValidEntityCode: () => isValidEntityCode,
	isWhiteSpace: () => isWhiteSpace,
	lib: () => lib,
	mdurl: () => mdurl_exports,
	normalizeReference: () => normalizeReference,
	ucmicro: () => ucmicro,
	unescapeAll: () => unescapeAll$1,
	unescapeMd: () => unescapeMd
});
const ucmicro = uc_exports;
function _class$1(obj) {
	return Object.prototype.toString.call(obj);
}
function isString$1(obj) {
	return _class$1(obj) === "[object String]";
}
const _hasOwnProperty = Object.prototype.hasOwnProperty;
function has(object, key) {
	return _hasOwnProperty.call(object, key);
}
function assign$1(obj, ...sources) {
	sources.forEach((source) => {
		if (!source) return;
		if (typeof source !== "object") throw new TypeError(`${String(source)}must be object`);
		Object.keys(source).forEach((key) => {
			obj[key] = source[key];
		});
	});
	return obj;
}
function isSpace$8(code$1) {
	return code$1 === 9 || code$1 === 32;
}
function isWhiteSpace(code$1) {
	if (code$1 >= 8192 && code$1 <= 8202) return true;
	switch (code$1) {
		case 9:
		case 10:
		case 11:
		case 12:
		case 13:
		case 32:
		case 160:
		case 5760:
		case 8239:
		case 8287:
		case 12288: return true;
	}
	return false;
}
function isPunctChar(ch) {
	return ucmicro.P.test(ch) || ucmicro.S.test(ch);
}
const PUNCT_CHAR_CACHE = /* @__PURE__ */ new Map();
function isPunctCode(ch) {
	if (isMdAsciiPunct(ch)) return true;
	const cached = PUNCT_CHAR_CACHE.get(ch);
	if (cached !== void 0) return cached;
	const value = isPunctChar(String.fromCharCode(ch));
	PUNCT_CHAR_CACHE.set(ch, value);
	return value;
}
function isMdAsciiPunct(ch) {
	switch (ch) {
		case 33:
		case 34:
		case 35:
		case 36:
		case 37:
		case 38:
		case 39:
		case 40:
		case 41:
		case 42:
		case 43:
		case 44:
		case 45:
		case 46:
		case 47:
		case 58:
		case 59:
		case 60:
		case 61:
		case 62:
		case 63:
		case 64:
		case 91:
		case 92:
		case 93:
		case 94:
		case 95:
		case 96:
		case 123:
		case 124:
		case 125:
		case 126: return true;
		default: return false;
	}
}
function normalizeReference(str) {
	str = str.trim().replace(/\s+/g, " ");
	if ("ẞ".toLowerCase() === "Ṿ") str = str.replace(/ẞ/g, "ß");
	return str.toLowerCase().toUpperCase();
}
function arrayReplaceAt(src, pos, newElements) {
	return [
		...src.slice(0, pos),
		...newElements,
		...src.slice(pos + 1)
	];
}
function isValidEntityCode(c) {
	if (c >= 55296 && c <= 57343) return false;
	if (c >= 64976 && c <= 65007) return false;
	if ((c & 65535) === 65535 || (c & 65535) === 65534) return false;
	if (c >= 0 && c <= 8) return false;
	if (c === 11) return false;
	if (c >= 14 && c <= 31) return false;
	if (c >= 127 && c <= 159) return false;
	if (c > 1114111) return false;
	return true;
}
function fromCodePoint(c) {
	if (c > 65535) {
		c -= 65536;
		const surrogate1 = 55296 + (c >> 10);
		const surrogate2 = 56320 + (c & 1023);
		return String.fromCharCode(surrogate1, surrogate2);
	}
	return String.fromCharCode(c);
}
const UNESCAPE_MD_RE = /\\([!"#$%&'()*+,\-\./:;<=>?@[\\\]^_`{|}~])/g;
const UNESCAPE_ALL_RE$1 = new RegExp(`${UNESCAPE_MD_RE.source}|${/&([a-z#][a-z0-9]{1,31});/gi.source}`, "gi");
const DIGITAL_ENTITY_TEST_RE$1 = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))$/i;
function replaceEntityPattern(match, name) {
	if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE$1.test(name)) {
		const code$1 = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
		if (isValidEntityCode(code$1)) return fromCodePoint(code$1);
		return match;
	}
	const decoded = decodeHTML(match);
	if (decoded !== match) return decoded;
	return match;
}
function unescapeMd(str) {
	if (!str.includes("\\")) return str;
	return str.replace(UNESCAPE_MD_RE, "$1");
}
function unescapeAll$1(str) {
	if (!str.includes("\\") && !str.includes("&")) return str;
	return str.replace(UNESCAPE_ALL_RE$1, (match, escaped, entity$1) => {
		if (escaped) return escaped;
		return replaceEntityPattern(match, entity$1);
	});
}
const HTML_ESCAPE_TEST_RE$1 = /[&<>"]/;
const HTML_ESCAPE_REPLACE_RE$1 = /[&<>"]/g;
const HTML_REPLACEMENTS$1 = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
};
function replaceUnsafeChar$1(ch) {
	return HTML_REPLACEMENTS$1[ch];
}
function escapeHtml$3(str) {
	if (HTML_ESCAPE_TEST_RE$1.test(str)) return str.replace(HTML_ESCAPE_REPLACE_RE$1, replaceUnsafeChar$1);
	return str;
}
const REGEXP_ESCAPE_RE = /[.?*+^$[\]\\(){}|-]/g;
function escapeRE$1(str) {
	return str.replace(REGEXP_ESCAPE_RE, "\\$&");
}
const lib = {
	mdurl: mdurl_exports,
	ucmicro
};
function countLines(input) {
	if (input.length === 0) return 0;
	let count = 0;
	let pos = -1;
	while ((pos = input.indexOf("\n", pos + 1)) !== -1) count++;
	return count;
}
const FOOTNOTE_DEF_RE = /(?:^|\n)[ \t]{0,3}\[\^[^\]\n]+\]:/m;
const ABBR_DEF_RE = /(?:^|\n)[ \t]{0,3}\*\[[^\]\n]+\]:/m;
const REFERENCE_DEF_RE = /(?:^|\n)[ \t]{0,3}\[(?!\^)(?:\\[\s\S]|[^\]\\[])+\][ \t]*:/m;
const GLOBAL_STATE_ENV_KEYS = [
	"references",
	"footnotes",
	"abbreviations",
	"abbr",
	"abbrs"
];
const GLOBAL_STATE_ENV_MARKER = Symbol.for("markdown-it-ts.global-state");
const hasOwn$2 = Object.prototype.hasOwnProperty;
function isGlobalMarkdownStateReason(value) {
	return value === "reference-definition" || value === "footnote-definition" || value === "abbreviation-definition";
}
function isPlainObject$1(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
function cloneSnapshotValue(value) {
	if (Array.isArray(value)) return value.map((item) => cloneSnapshotValue(item));
	if (isPlainObject$1(value)) {
		const out = {};
		for (const key of Object.keys(value)) out[key] = cloneSnapshotValue(value[key]);
		return out;
	}
	return value;
}
function ownKeys(value) {
	if (Array.isArray(value)) return value.map((_, index) => String(index));
	if (isPlainObject$1(value)) return Object.keys(value);
	return [];
}
function snapshotValueEquals(left, right) {
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		if (left.length !== right.length) return false;
		for (let i = 0; i < left.length; i++) if (!snapshotValueEquals(left[i], right[i])) return false;
		return true;
	}
	if (isPlainObject$1(left) || isPlainObject$1(right)) {
		if (!isPlainObject$1(left) || !isPlainObject$1(right)) return false;
		const leftKeys = Object.keys(left);
		const rightKeys = Object.keys(right);
		if (leftKeys.length !== rightKeys.length) return false;
		for (const key of leftKeys) if (!hasOwn$2.call(right, key) || !snapshotValueEquals(left[key], right[key])) return false;
		return true;
	}
	return Object.is(left, right);
}
function getSnapshotKeyValue(value, key) {
	if (Array.isArray(value)) return value[Number(key)];
	if (isPlainObject$1(value)) return value[key];
}
function restoreSnapshotValue(target, snapshot) {
	if (Array.isArray(target) && Array.isArray(snapshot)) {
		target.length = snapshot.length;
		for (let i = 0; i < snapshot.length; i++) target[i] = cloneSnapshotValue(snapshot[i]);
		return target;
	}
	if (isPlainObject$1(target) && isPlainObject$1(snapshot)) {
		for (const key of Object.keys(target)) if (!hasOwn$2.call(snapshot, key)) delete target[key];
		for (const key of Object.keys(snapshot)) target[key] = cloneSnapshotValue(snapshot[key]);
		return target;
	}
	return cloneSnapshotValue(snapshot);
}
function resetOwnedSnapshotValue(env, key, entry) {
	const ownedKeys = entry.ownedKeys ?? [];
	const target = env[key];
	if (isPlainObject$1(target) || Array.isArray(target)) {
		const snapshotKeys = new Set(ownKeys(entry.value));
		for (const ownedKey of ownedKeys) if (entry.existed && snapshotKeys.has(ownedKey)) target[ownedKey] = cloneSnapshotValue(getSnapshotKeyValue(entry.value, ownedKey));
		else delete target[ownedKey];
		if (!entry.existed && ownKeys(target).length === 0) delete env[key];
		return;
	}
	if (entry.existed) env[key] = cloneSnapshotValue(entry.value);
	else delete env[key];
}
function getMarker(env) {
	const value = env[GLOBAL_STATE_ENV_MARKER];
	if (isGlobalMarkdownStateReason(value)) return {
		reason: value,
		snapshot: {}
	};
	if (value && typeof value === "object" && isGlobalMarkdownStateReason(value.reason) && value.snapshot && typeof value.snapshot === "object") return value;
	return null;
}
function setMarker(env, marker) {
	Object.defineProperty(env, GLOBAL_STATE_ENV_MARKER, {
		value: marker,
		enumerable: false,
		configurable: true,
		writable: true
	});
}
function detectGlobalMarkdownState(src) {
	if (!src) return null;
	if (FOOTNOTE_DEF_RE.test(src)) return "footnote-definition";
	if (ABBR_DEF_RE.test(src)) return "abbreviation-definition";
	if (REFERENCE_DEF_RE.test(src)) return "reference-definition";
	return null;
}
function getKnownGlobalMarkdownState(env) {
	return getMarker(env)?.reason ?? null;
}
function runWithKnownGlobalMarkdownState(env, reason, run) {
	if (getKnownGlobalMarkdownState(env)) resetKnownGlobalMarkdownState(env);
	if (!reason) return run();
	markKnownGlobalMarkdownState(env, reason);
	try {
		const result = run();
		finalizeKnownGlobalMarkdownState(env);
		return result;
	} catch (error$1) {
		resetKnownGlobalMarkdownState(env);
		throw error$1;
	}
}
function markKnownGlobalMarkdownState(env, reason) {
	try {
		resetKnownGlobalMarkdownState(env);
		const snapshot = {};
		for (const key of GLOBAL_STATE_ENV_KEYS) snapshot[key] = hasOwn$2.call(env, key) ? {
			existed: true,
			value: cloneSnapshotValue(env[key])
		} : { existed: false };
		setMarker(env, {
			reason,
			snapshot
		});
	} catch {}
}
function finalizeKnownGlobalMarkdownState(env) {
	const marker = getMarker(env);
	if (!marker) return;
	for (const key of GLOBAL_STATE_ENV_KEYS) {
		const entry = marker.snapshot[key];
		if (!entry) continue;
		entry.ownedKeys = [];
		const after = env[key];
		if (!isPlainObject$1(after) && !Array.isArray(after)) continue;
		const beforeKeys = new Set(ownKeys(entry.existed ? entry.value : void 0));
		entry.ownedKeys = ownKeys(after).filter((name) => {
			if (!beforeKeys.has(name)) return true;
			return !snapshotValueEquals(after[name], getSnapshotKeyValue(entry.value, name));
		});
	}
}
function resetKnownGlobalMarkdownState(env) {
	const marker = getMarker(env);
	if (!marker) return;
	for (const key of GLOBAL_STATE_ENV_KEYS) {
		const entry = marker.snapshot[key];
		if (!entry) {
			delete env[key];
			continue;
		}
		if (entry.ownedKeys) {
			resetOwnedSnapshotValue(env, key, entry);
			continue;
		}
		if (entry.existed) env[key] = restoreSnapshotValue(env[key], entry.value);
		else delete env[key];
	}
	delete env[GLOBAL_STATE_ENV_MARKER];
}
const MDTS_DIAGNOSTICS = Symbol.for("markdown-it-ts.diagnostics");
function getDiagnosticsStore(env, create) {
	if (!env) return void 0;
	try {
		const existing = env[MDTS_DIAGNOSTICS];
		if (existing && typeof existing === "object") return existing;
		if (!create) return void 0;
		const diagnostics = {};
		Object.defineProperty(env, MDTS_DIAGNOSTICS, {
			value: diagnostics,
			enumerable: false,
			configurable: true,
			writable: true
		});
		return diagnostics;
	} catch {
		return;
	}
}
function getParseDiagnostics(env) {
	return getDiagnosticsStore(env, false);
}
function clearParseDiagnostics(env) {
	if (!env) return;
	try {
		delete env[MDTS_DIAGNOSTICS];
	} catch {}
}
function beginParseDiagnostics(env) {
	clearParseDiagnostics(env);
}
function setStrategyDiagnostics(env, info) {
	const diagnostics = getDiagnosticsStore(env, true);
	if (!diagnostics) return;
	diagnostics.strategy = info;
}
function setChunkDiagnostics(env, info) {
	const diagnostics = getDiagnosticsStore(env, true);
	if (!diagnostics) return;
	diagnostics.chunk = info;
}
function setUnboundedDiagnostics(env, info) {
	const diagnostics = getDiagnosticsStore(env, true);
	if (!diagnostics) return;
	diagnostics.unbounded = info;
}

//#endregion
//#region ../../node_modules/.pnpm/linkify-it@5.0.0/node_modules/linkify-it/lib/re.mjs
function re_default(opts) {
	const re = {};
	opts = opts || {};
	re.src_Any = regex_default.source;
	re.src_Cc = regex_default$1.source;
	re.src_Z = regex_default$2.source;
	re.src_P = regex_default$3.source;
	re.src_ZPCc = [
		re.src_Z,
		re.src_P,
		re.src_Cc
	].join("|");
	re.src_ZCc = [re.src_Z, re.src_Cc].join("|");
	const text_separators = "[><｜]";
	re.src_pseudo_letter = "(?:(?!" + text_separators + "|" + re.src_ZPCc + ")" + re.src_Any + ")";
	re.src_ip4 = "(?:(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
	re.src_auth = "(?:(?:(?!" + re.src_ZCc + "|[@/\\[\\]()]).)+@)?";
	re.src_port = "(?::(?:6(?:[0-4]\\d{3}|5(?:[0-4]\\d{2}|5(?:[0-2]\\d|3[0-5])))|[1-5]?\\d{1,4}))?";
	re.src_host_terminator = "(?=$|" + text_separators + "|" + re.src_ZPCc + ")(?!" + (opts["---"] ? "-(?!--)|" : "-|") + "_|:\\d|\\.-|\\.(?!$|" + re.src_ZPCc + "))";
	re.src_path = "(?:[/?#](?:(?!" + re.src_ZCc + "|[><｜]|[()[\\]{}.,\"'?!\\-;]).|\\[(?:(?!" + re.src_ZCc + "|\\]).)*\\]|\\((?:(?!" + re.src_ZCc + "|[)]).)*\\)|\\{(?:(?!" + re.src_ZCc + "|[}]).)*\\}|\\\"(?:(?!" + re.src_ZCc + "|[\"]).)+\\\"|\\'(?:(?!" + re.src_ZCc + "|[']).)+\\'|\\'(?=" + re.src_pseudo_letter + "|[-])|\\.{2,}[a-zA-Z0-9%/&]|\\.(?!" + re.src_ZCc + "|[.]|$)|" + (opts["---"] ? "\\-(?!--(?:[^-]|$))(?:-*)|" : "\\-+|") + ",(?!" + re.src_ZCc + "|$)|;(?!" + re.src_ZCc + "|$)|\\!+(?!" + re.src_ZCc + "|[!]|$)|\\?(?!" + re.src_ZCc + "|[?]|$))+|\\/)?";
	re.src_email_name = "[\\-;:&=\\+\\$,\\.a-zA-Z0-9_][\\-;:&=\\+\\$,\\\"\\.a-zA-Z0-9_]*";
	re.src_xn = "xn--[a-z0-9\\-]{1,59}";
	re.src_domain_root = "(?:" + re.src_xn + "|" + re.src_pseudo_letter + "{1,63})";
	re.src_domain = "(?:" + re.src_xn + "|(?:" + re.src_pseudo_letter + ")|(?:" + re.src_pseudo_letter + "(?:-|" + re.src_pseudo_letter + "){0,61}" + re.src_pseudo_letter + "))";
	re.src_host = "(?:(?:(?:(?:" + re.src_domain + ")\\.)*" + re.src_domain + "))";
	re.tpl_host_fuzzy = "(?:" + re.src_ip4 + "|(?:(?:(?:" + re.src_domain + ")\\.)+(?:%TLDS%)))";
	re.tpl_host_no_ip_fuzzy = "(?:(?:(?:" + re.src_domain + ")\\.)+(?:%TLDS%))";
	re.src_host_strict = re.src_host + re.src_host_terminator;
	re.tpl_host_fuzzy_strict = re.tpl_host_fuzzy + re.src_host_terminator;
	re.src_host_port_strict = re.src_host + re.src_port + re.src_host_terminator;
	re.tpl_host_port_fuzzy_strict = re.tpl_host_fuzzy + re.src_port + re.src_host_terminator;
	re.tpl_host_port_no_ip_fuzzy_strict = re.tpl_host_no_ip_fuzzy + re.src_port + re.src_host_terminator;
	re.tpl_host_fuzzy_test = "localhost|www\\.|\\.\\d{1,3}\\.|(?:\\.(?:%TLDS%)(?:" + re.src_ZPCc + "|>|$))";
	re.tpl_email_fuzzy = "(^|" + text_separators + "|\"|\\(|" + re.src_ZCc + ")(" + re.src_email_name + "@" + re.tpl_host_fuzzy_strict + ")";
	re.tpl_link_fuzzy = "(^|(?![.:/\\-_@])(?:[$+<=>^`|｜]|" + re.src_ZPCc + "))((?![$+<=>^`|｜])" + re.tpl_host_port_fuzzy_strict + re.src_path + ")";
	re.tpl_link_no_ip_fuzzy = "(^|(?![.:/\\-_@])(?:[$+<=>^`|｜]|" + re.src_ZPCc + "))((?![$+<=>^`|｜])" + re.tpl_host_port_no_ip_fuzzy_strict + re.src_path + ")";
	return re;
}

//#endregion
//#region ../../node_modules/.pnpm/linkify-it@5.0.0/node_modules/linkify-it/index.mjs
function assign(obj) {
	Array.prototype.slice.call(arguments, 1).forEach(function(source) {
		if (!source) return;
		Object.keys(source).forEach(function(key) {
			obj[key] = source[key];
		});
	});
	return obj;
}
function _class(obj) {
	return Object.prototype.toString.call(obj);
}
function isString(obj) {
	return _class(obj) === "[object String]";
}
function isObject(obj) {
	return _class(obj) === "[object Object]";
}
function isRegExp(obj) {
	return _class(obj) === "[object RegExp]";
}
function isFunction(obj) {
	return _class(obj) === "[object Function]";
}
function escapeRE(str) {
	return str.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&");
}
const defaultOptions = {
	fuzzyLink: true,
	fuzzyEmail: true,
	fuzzyIP: false
};
function isOptionsObj(obj) {
	return Object.keys(obj || {}).reduce(function(acc, k) {
		return acc || defaultOptions.hasOwnProperty(k);
	}, false);
}
const defaultSchemas = {
	"http:": { validate: function(text$1, pos, self) {
		const tail = text$1.slice(pos);
		if (!self.re.http) self.re.http = new RegExp("^\\/\\/" + self.re.src_auth + self.re.src_host_port_strict + self.re.src_path, "i");
		if (self.re.http.test(tail)) return tail.match(self.re.http)[0].length;
		return 0;
	} },
	"https:": "http:",
	"ftp:": "http:",
	"//": { validate: function(text$1, pos, self) {
		const tail = text$1.slice(pos);
		if (!self.re.no_http) self.re.no_http = new RegExp("^" + self.re.src_auth + "(?:localhost|(?:(?:" + self.re.src_domain + ")\\.)+" + self.re.src_domain_root + ")" + self.re.src_port + self.re.src_host_terminator + self.re.src_path, "i");
		if (self.re.no_http.test(tail)) {
			if (pos >= 3 && text$1[pos - 3] === ":") return 0;
			if (pos >= 3 && text$1[pos - 3] === "/") return 0;
			return tail.match(self.re.no_http)[0].length;
		}
		return 0;
	} },
	"mailto:": { validate: function(text$1, pos, self) {
		const tail = text$1.slice(pos);
		if (!self.re.mailto) self.re.mailto = new RegExp("^" + self.re.src_email_name + "@" + self.re.src_host_strict, "i");
		if (self.re.mailto.test(tail)) return tail.match(self.re.mailto)[0].length;
		return 0;
	} }
};
const tlds_2ch_src_re = "a[cdefgilmnoqrstuwxz]|b[abdefghijmnorstvwyz]|c[acdfghiklmnoruvwxyz]|d[ejkmoz]|e[cegrstu]|f[ijkmor]|g[abdefghilmnpqrstuwy]|h[kmnrtu]|i[delmnoqrst]|j[emop]|k[eghimnprwyz]|l[abcikrstuvy]|m[acdeghklmnopqrstuvwxyz]|n[acefgilopruz]|om|p[aefghklmnrstwy]|qa|r[eosuw]|s[abcdeghijklmnortuvxyz]|t[cdfghjklmnortvwz]|u[agksyz]|v[aceginu]|w[fs]|y[et]|z[amw]";
const tlds_default = "biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф".split("|");
function resetScanCache(self) {
	self.__index__ = -1;
	self.__text_cache__ = "";
}
function createValidator(re) {
	return function(text$1, pos) {
		const tail = text$1.slice(pos);
		if (re.test(tail)) return tail.match(re)[0].length;
		return 0;
	};
}
function createNormalizer() {
	return function(match, self) {
		self.normalize(match);
	};
}
function compile(self) {
	const re = self.re = re_default(self.__opts__);
	const tlds = self.__tlds__.slice();
	self.onCompile();
	if (!self.__tlds_replaced__) tlds.push(tlds_2ch_src_re);
	tlds.push(re.src_xn);
	re.src_tlds = tlds.join("|");
	function untpl(tpl) {
		return tpl.replace("%TLDS%", re.src_tlds);
	}
	re.email_fuzzy = RegExp(untpl(re.tpl_email_fuzzy), "i");
	re.link_fuzzy = RegExp(untpl(re.tpl_link_fuzzy), "i");
	re.link_no_ip_fuzzy = RegExp(untpl(re.tpl_link_no_ip_fuzzy), "i");
	re.host_fuzzy_test = RegExp(untpl(re.tpl_host_fuzzy_test), "i");
	const aliases = [];
	self.__compiled__ = {};
	function schemaError(name, val) {
		throw new Error("(LinkifyIt) Invalid schema \"" + name + "\": " + val);
	}
	Object.keys(self.__schemas__).forEach(function(name) {
		const val = self.__schemas__[name];
		if (val === null) return;
		const compiled = {
			validate: null,
			link: null
		};
		self.__compiled__[name] = compiled;
		if (isObject(val)) {
			if (isRegExp(val.validate)) compiled.validate = createValidator(val.validate);
			else if (isFunction(val.validate)) compiled.validate = val.validate;
			else schemaError(name, val);
			if (isFunction(val.normalize)) compiled.normalize = val.normalize;
			else if (!val.normalize) compiled.normalize = createNormalizer();
			else schemaError(name, val);
			return;
		}
		if (isString(val)) {
			aliases.push(name);
			return;
		}
		schemaError(name, val);
	});
	aliases.forEach(function(alias) {
		if (!self.__compiled__[self.__schemas__[alias]]) return;
		self.__compiled__[alias].validate = self.__compiled__[self.__schemas__[alias]].validate;
		self.__compiled__[alias].normalize = self.__compiled__[self.__schemas__[alias]].normalize;
	});
	self.__compiled__[""] = {
		validate: null,
		normalize: createNormalizer()
	};
	const slist = Object.keys(self.__compiled__).filter(function(name) {
		return name.length > 0 && self.__compiled__[name];
	}).map(escapeRE).join("|");
	self.re.schema_test = RegExp("(^|(?!_)(?:[><｜]|" + re.src_ZPCc + "))(" + slist + ")", "i");
	self.re.schema_search = RegExp("(^|(?!_)(?:[><｜]|" + re.src_ZPCc + "))(" + slist + ")", "ig");
	self.re.schema_at_start = RegExp("^" + self.re.schema_search.source, "i");
	self.re.pretest = RegExp("(" + self.re.schema_test.source + ")|(" + self.re.host_fuzzy_test.source + ")|@", "i");
	resetScanCache(self);
}
/**
* class Match
*
* Match result. Single element of array, returned by [[LinkifyIt#match]]
**/
function Match(self, shift) {
	const start = self.__index__;
	const end = self.__last_index__;
	const text$1 = self.__text_cache__.slice(start, end);
	/**
	* Match#schema -> String
	*
	* Prefix (protocol) for matched string.
	**/
	this.schema = self.__schema__.toLowerCase();
	/**
	* Match#index -> Number
	*
	* First position of matched string.
	**/
	this.index = start + shift;
	/**
	* Match#lastIndex -> Number
	*
	* Next position after matched string.
	**/
	this.lastIndex = end + shift;
	/**
	* Match#raw -> String
	*
	* Matched string.
	**/
	this.raw = text$1;
	/**
	* Match#text -> String
	*
	* Notmalized text of matched string.
	**/
	this.text = text$1;
	/**
	* Match#url -> String
	*
	* Normalized url of matched string.
	**/
	this.url = text$1;
}
function createMatch(self, shift) {
	const match = new Match(self, shift);
	self.__compiled__[match.schema].normalize(match, self);
	return match;
}
/**
* class LinkifyIt
**/
/**
* new LinkifyIt(schemas, options)
* - schemas (Object): Optional. Additional schemas to validate (prefix/validator)
* - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
*
* Creates new linkifier instance with optional additional schemas.
* Can be called without `new` keyword for convenience.
*
* By default understands:
*
* - `http(s)://...` , `ftp://...`, `mailto:...` & `//...` links
* - "fuzzy" links and emails (example.com, foo@bar.com).
*
* `schemas` is an object, where each key/value describes protocol/rule:
*
* - __key__ - link prefix (usually, protocol name with `:` at the end, `skype:`
*   for example). `linkify-it` makes shure that prefix is not preceeded with
*   alphanumeric char and symbols. Only whitespaces and punctuation allowed.
* - __value__ - rule to check tail after link prefix
*   - _String_ - just alias to existing rule
*   - _Object_
*     - _validate_ - validator function (should return matched length on success),
*       or `RegExp`.
*     - _normalize_ - optional function to normalize text & url of matched result
*       (for example, for @twitter mentions).
*
* `options`:
*
* - __fuzzyLink__ - recognige URL-s without `http(s):` prefix. Default `true`.
* - __fuzzyIP__ - allow IPs in fuzzy links above. Can conflict with some texts
*   like version numbers. Default `false`.
* - __fuzzyEmail__ - recognize emails without `mailto:` prefix.
*
**/
function LinkifyIt(schemas, options) {
	if (!(this instanceof LinkifyIt)) return new LinkifyIt(schemas, options);
	if (!options) {
		if (isOptionsObj(schemas)) {
			options = schemas;
			schemas = {};
		}
	}
	this.__opts__ = assign({}, defaultOptions, options);
	this.__index__ = -1;
	this.__last_index__ = -1;
	this.__schema__ = "";
	this.__text_cache__ = "";
	this.__schemas__ = assign({}, defaultSchemas, schemas);
	this.__compiled__ = {};
	this.__tlds__ = tlds_default;
	this.__tlds_replaced__ = false;
	this.re = {};
	compile(this);
}
/** chainable
* LinkifyIt#add(schema, definition)
* - schema (String): rule name (fixed pattern prefix)
* - definition (String|RegExp|Object): schema definition
*
* Add new rule definition. See constructor description for details.
**/
LinkifyIt.prototype.add = function add(schema, definition) {
	this.__schemas__[schema] = definition;
	compile(this);
	return this;
};
/** chainable
* LinkifyIt#set(options)
* - options (Object): { fuzzyLink|fuzzyEmail|fuzzyIP: true|false }
*
* Set recognition options for links without schema.
**/
LinkifyIt.prototype.set = function set(options) {
	this.__opts__ = assign(this.__opts__, options);
	return this;
};
/**
* LinkifyIt#test(text) -> Boolean
*
* Searches linkifiable pattern and returns `true` on success or `false` on fail.
**/
LinkifyIt.prototype.test = function test(text$1) {
	this.__text_cache__ = text$1;
	this.__index__ = -1;
	if (!text$1.length) return false;
	let m, ml, me, len, shift, next, re, tld_pos, at_pos;
	if (this.re.schema_test.test(text$1)) {
		re = this.re.schema_search;
		re.lastIndex = 0;
		while ((m = re.exec(text$1)) !== null) {
			len = this.testSchemaAt(text$1, m[2], re.lastIndex);
			if (len) {
				this.__schema__ = m[2];
				this.__index__ = m.index + m[1].length;
				this.__last_index__ = m.index + m[0].length + len;
				break;
			}
		}
	}
	if (this.__opts__.fuzzyLink && this.__compiled__["http:"]) {
		tld_pos = text$1.search(this.re.host_fuzzy_test);
		if (tld_pos >= 0) {
			if (this.__index__ < 0 || tld_pos < this.__index__) {
				if ((ml = text$1.match(this.__opts__.fuzzyIP ? this.re.link_fuzzy : this.re.link_no_ip_fuzzy)) !== null) {
					shift = ml.index + ml[1].length;
					if (this.__index__ < 0 || shift < this.__index__) {
						this.__schema__ = "";
						this.__index__ = shift;
						this.__last_index__ = ml.index + ml[0].length;
					}
				}
			}
		}
	}
	if (this.__opts__.fuzzyEmail && this.__compiled__["mailto:"]) {
		at_pos = text$1.indexOf("@");
		if (at_pos >= 0) {
			if ((me = text$1.match(this.re.email_fuzzy)) !== null) {
				shift = me.index + me[1].length;
				next = me.index + me[0].length;
				if (this.__index__ < 0 || shift < this.__index__ || shift === this.__index__ && next > this.__last_index__) {
					this.__schema__ = "mailto:";
					this.__index__ = shift;
					this.__last_index__ = next;
				}
			}
		}
	}
	return this.__index__ >= 0;
};
/**
* LinkifyIt#pretest(text) -> Boolean
*
* Very quick check, that can give false positives. Returns true if link MAY BE
* can exists. Can be used for speed optimization, when you need to check that
* link NOT exists.
**/
LinkifyIt.prototype.pretest = function pretest(text$1) {
	return this.re.pretest.test(text$1);
};
/**
* LinkifyIt#testSchemaAt(text, name, position) -> Number
* - text (String): text to scan
* - name (String): rule (schema) name
* - position (Number): text offset to check from
*
* Similar to [[LinkifyIt#test]] but checks only specific protocol tail exactly
* at given position. Returns length of found pattern (0 on fail).
**/
LinkifyIt.prototype.testSchemaAt = function testSchemaAt(text$1, schema, pos) {
	if (!this.__compiled__[schema.toLowerCase()]) return 0;
	return this.__compiled__[schema.toLowerCase()].validate(text$1, pos, this);
};
/**
* LinkifyIt#match(text) -> Array|null
*
* Returns array of found link descriptions or `null` on fail. We strongly
* recommend to use [[LinkifyIt#test]] first, for best speed.
*
* ##### Result match description
*
* - __schema__ - link schema, can be empty for fuzzy links, or `//` for
*   protocol-neutral  links.
* - __index__ - offset of matched text
* - __lastIndex__ - index of next char after mathch end
* - __raw__ - matched text
* - __text__ - normalized text
* - __url__ - link, generated from matched text
**/
LinkifyIt.prototype.match = function match(text$1) {
	const result = [];
	let shift = 0;
	if (this.__index__ >= 0 && this.__text_cache__ === text$1) {
		result.push(createMatch(this, shift));
		shift = this.__last_index__;
	}
	let tail = shift ? text$1.slice(shift) : text$1;
	while (this.test(tail)) {
		result.push(createMatch(this, shift));
		tail = tail.slice(this.__last_index__);
		shift += this.__last_index__;
	}
	if (result.length) return result;
	return null;
};
/**
* LinkifyIt#matchAtStart(text) -> Match|null
*
* Returns fully-formed (not fuzzy) link if it starts at the beginning
* of the string, and null otherwise.
**/
LinkifyIt.prototype.matchAtStart = function matchAtStart(text$1) {
	this.__text_cache__ = text$1;
	this.__index__ = -1;
	if (!text$1.length) return null;
	const m = this.re.schema_at_start.exec(text$1);
	if (!m) return null;
	const len = this.testSchemaAt(text$1, m[2], m[0].length);
	if (!len) return null;
	this.__schema__ = m[2];
	this.__index__ = m.index + m[1].length;
	this.__last_index__ = m.index + m[0].length + len;
	return createMatch(this, 0);
};
/** chainable
* LinkifyIt#tlds(list [, keepOld]) -> this
* - list (Array): list of tlds
* - keepOld (Boolean): merge with current list if `true` (`false` by default)
*
* Load (or merge) new tlds list. Those are user for fuzzy links (without prefix)
* to avoid false positives. By default this algorythm used:
*
* - hostname with any 2-letter root zones are ok.
* - biz|com|edu|gov|net|org|pro|web|xxx|aero|asia|coop|info|museum|name|shop|рф
*   are ok.
* - encoded (`xn--...`) root zones are ok.
*
* If list is replaced, then exact match for 2-chars root zones will be checked.
**/
LinkifyIt.prototype.tlds = function tlds(list$1, keepOld) {
	list$1 = Array.isArray(list$1) ? list$1 : [list$1];
	if (!keepOld) {
		this.__tlds__ = list$1.slice();
		this.__tlds_replaced__ = true;
		compile(this);
		return this;
	}
	this.__tlds__ = this.__tlds__.concat(list$1).sort().filter(function(el, idx, arr) {
		return el !== arr[idx - 1];
	}).reverse();
	compile(this);
	return this;
};
/**
* LinkifyIt#normalize(match)
*
* Default normalizer (if schema does not define it's own).
**/
LinkifyIt.prototype.normalize = function normalize$1(match) {
	if (!match.schema) match.url = "http://" + match.url;
	if (match.schema === "mailto:" && !/^mailto:/i.test(match.url)) match.url = "mailto:" + match.url;
};
/**
* LinkifyIt#onCompile()
*
* Override to modify basic RegExp-s.
**/
LinkifyIt.prototype.onCompile = function onCompile() {};
var linkify_it_default = LinkifyIt;

//#endregion
//#region ../../node_modules/.pnpm/punycode.js@2.3.1/node_modules/punycode.js/punycode.js
var require_punycode = /* @__PURE__ */ __commonJS({ "../../node_modules/.pnpm/punycode.js@2.3.1/node_modules/punycode.js/punycode.js": ((exports, module) => {
	/** Highest positive signed 32-bit float value */
	const maxInt = 2147483647;
	/** Bootstring parameters */
	const base = 36;
	const tMin = 1;
	const tMax = 26;
	const skew = 38;
	const damp = 700;
	const initialBias = 72;
	const initialN = 128;
	const delimiter = "-";
	/** Regular expressions */
	const regexPunycode = /^xn--/;
	const regexNonASCII = /[^\0-\x7F]/;
	const regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g;
	/** Error messages */
	const errors = {
		"overflow": "Overflow: input needs wider integers to process",
		"not-basic": "Illegal input >= 0x80 (not a basic code point)",
		"invalid-input": "Invalid input"
	};
	/** Convenience shortcuts */
	const baseMinusTMin = base - tMin;
	const floor = Math.floor;
	const stringFromCharCode = String.fromCharCode;
	/**
	* A generic error utility function.
	* @private
	* @param {String} type The error type.
	* @returns {Error} Throws a `RangeError` with the applicable error message.
	*/
	function error(type) {
		throw new RangeError(errors[type]);
	}
	/**
	* A generic `Array#map` utility function.
	* @private
	* @param {Array} array The array to iterate over.
	* @param {Function} callback The function that gets called for every array
	* item.
	* @returns {Array} A new array of values returned by the callback function.
	*/
	function map(array, callback) {
		const result = [];
		let length = array.length;
		while (length--) result[length] = callback(array[length]);
		return result;
	}
	/**
	* A simple `Array#map`-like wrapper to work with domain name strings or email
	* addresses.
	* @private
	* @param {String} domain The domain name or email address.
	* @param {Function} callback The function that gets called for every
	* character.
	* @returns {String} A new string of characters returned by the callback
	* function.
	*/
	function mapDomain(domain, callback) {
		const parts = domain.split("@");
		let result = "";
		if (parts.length > 1) {
			result = parts[0] + "@";
			domain = parts[1];
		}
		domain = domain.replace(regexSeparators, ".");
		const encoded = map(domain.split("."), callback).join(".");
		return result + encoded;
	}
	/**
	* Creates an array containing the numeric code points of each Unicode
	* character in the string. While JavaScript uses UCS-2 internally,
	* this function will convert a pair of surrogate halves (each of which
	* UCS-2 exposes as separate characters) into a single code point,
	* matching UTF-16.
	* @see `punycode.ucs2.encode`
	* @see <https://mathiasbynens.be/notes/javascript-encoding>
	* @memberOf punycode.ucs2
	* @name decode
	* @param {String} string The Unicode input string (UCS-2).
	* @returns {Array} The new array of code points.
	*/
	function ucs2decode(string) {
		const output = [];
		let counter = 0;
		const length = string.length;
		while (counter < length) {
			const value = string.charCodeAt(counter++);
			if (value >= 55296 && value <= 56319 && counter < length) {
				const extra = string.charCodeAt(counter++);
				if ((extra & 64512) == 56320) output.push(((value & 1023) << 10) + (extra & 1023) + 65536);
				else {
					output.push(value);
					counter--;
				}
			} else output.push(value);
		}
		return output;
	}
	/**
	* Creates a string based on an array of numeric code points.
	* @see `punycode.ucs2.decode`
	* @memberOf punycode.ucs2
	* @name encode
	* @param {Array} codePoints The array of numeric code points.
	* @returns {String} The new Unicode string (UCS-2).
	*/
	const ucs2encode = (codePoints) => String.fromCodePoint(...codePoints);
	/**
	* Converts a basic code point into a digit/integer.
	* @see `digitToBasic()`
	* @private
	* @param {Number} codePoint The basic numeric code point value.
	* @returns {Number} The numeric value of a basic code point (for use in
	* representing integers) in the range `0` to `base - 1`, or `base` if
	* the code point does not represent a value.
	*/
	const basicToDigit = function(codePoint) {
		if (codePoint >= 48 && codePoint < 58) return 26 + (codePoint - 48);
		if (codePoint >= 65 && codePoint < 91) return codePoint - 65;
		if (codePoint >= 97 && codePoint < 123) return codePoint - 97;
		return base;
	};
	/**
	* Converts a digit/integer into a basic code point.
	* @see `basicToDigit()`
	* @private
	* @param {Number} digit The numeric value of a basic code point.
	* @returns {Number} The basic code point whose value (when used for
	* representing integers) is `digit`, which needs to be in the range
	* `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	* used; else, the lowercase form is used. The behavior is undefined
	* if `flag` is non-zero and `digit` has no uppercase form.
	*/
	const digitToBasic = function(digit, flag) {
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	};
	/**
	* Bias adaptation function as per section 3.4 of RFC 3492.
	* https://tools.ietf.org/html/rfc3492#section-3.4
	* @private
	*/
	const adapt = function(delta, numPoints, firstTime) {
		let k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (; delta > baseMinusTMin * tMax >> 1; k += base) delta = floor(delta / baseMinusTMin);
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	};
	/**
	* Converts a Punycode string of ASCII-only symbols to a string of Unicode
	* symbols.
	* @memberOf punycode
	* @param {String} input The Punycode string of ASCII-only symbols.
	* @returns {String} The resulting string of Unicode symbols.
	*/
	const decode = function(input) {
		const output = [];
		const inputLength = input.length;
		let i = 0;
		let n = initialN;
		let bias = initialBias;
		let basic = input.lastIndexOf(delimiter);
		if (basic < 0) basic = 0;
		for (let j = 0; j < basic; ++j) {
			if (input.charCodeAt(j) >= 128) error("not-basic");
			output.push(input.charCodeAt(j));
		}
		for (let index = basic > 0 ? basic + 1 : 0; index < inputLength;) {
			const oldi = i;
			for (let w = 1, k = base;; k += base) {
				if (index >= inputLength) error("invalid-input");
				const digit = basicToDigit(input.charCodeAt(index++));
				if (digit >= base) error("invalid-input");
				if (digit > floor((maxInt - i) / w)) error("overflow");
				i += digit * w;
				const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
				if (digit < t) break;
				const baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) error("overflow");
				w *= baseMinusT;
			}
			const out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);
			if (floor(i / out) > maxInt - n) error("overflow");
			n += floor(i / out);
			i %= out;
			output.splice(i++, 0, n);
		}
		return String.fromCodePoint(...output);
	};
	/**
	* Converts a string of Unicode symbols (e.g. a domain name label) to a
	* Punycode string of ASCII-only symbols.
	* @memberOf punycode
	* @param {String} input The string of Unicode symbols.
	* @returns {String} The resulting Punycode string of ASCII-only symbols.
	*/
	const encode = function(input) {
		const output = [];
		input = ucs2decode(input);
		const inputLength = input.length;
		let n = initialN;
		let delta = 0;
		let bias = initialBias;
		for (const currentValue of input) if (currentValue < 128) output.push(stringFromCharCode(currentValue));
		const basicLength = output.length;
		let handledCPCount = basicLength;
		if (basicLength) output.push(delimiter);
		while (handledCPCount < inputLength) {
			let m = maxInt;
			for (const currentValue of input) if (currentValue >= n && currentValue < m) m = currentValue;
			const handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) error("overflow");
			delta += (m - n) * handledCPCountPlusOne;
			n = m;
			for (const currentValue of input) {
				if (currentValue < n && ++delta > maxInt) error("overflow");
				if (currentValue === n) {
					let q = delta;
					for (let k = base;; k += base) {
						const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
						if (q < t) break;
						const qMinusT = q - t;
						const baseMinusT = base - t;
						output.push(stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0)));
						q = floor(qMinusT / baseMinusT);
					}
					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount === basicLength);
					delta = 0;
					++handledCPCount;
				}
			}
			++delta;
			++n;
		}
		return output.join("");
	};
	/**
	* Converts a Punycode string representing a domain name or an email address
	* to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	* it doesn't matter if you call it on a string that has already been
	* converted to Unicode.
	* @memberOf punycode
	* @param {String} input The Punycoded domain name or email address to
	* convert to Unicode.
	* @returns {String} The Unicode representation of the given Punycode
	* string.
	*/
	const toUnicode = function(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string) ? decode(string.slice(4).toLowerCase()) : string;
		});
	};
	/**
	* Converts a Unicode string representing a domain name or an email address to
	* Punycode. Only the non-ASCII parts of the domain name will be converted,
	* i.e. it doesn't matter if you call it with a domain that's already in
	* ASCII.
	* @memberOf punycode
	* @param {String} input The domain name or email address to convert, as a
	* Unicode string.
	* @returns {String} The Punycode representation of the given domain name or
	* email address.
	*/
	const toASCII = function(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string) ? "xn--" + encode(string) : string;
		});
	};
	/** Define the public API */
	const punycode$1 = {
		"version": "2.3.1",
		"ucs2": {
			"decode": ucs2decode,
			"encode": ucs2encode
		},
		"decode": decode,
		"encode": encode,
		"toASCII": toASCII,
		"toUnicode": toUnicode
	};
	module.exports = punycode$1;
}) });

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-ts@1.0.0/node_modules/markdown-it-ts/dist/parse-CZh7h656.js
var import_punycode = /* @__PURE__ */ __toESM(require_punycode(), 1);
/**
* class Token
*
* Create new token and fill passed properties.
*/
var Token = class {
	/**
	* Token#type -> String
	*
	* Type of the token (string, e.g. "paragraph_open")
	*/
	type;
	/**
	* Token#tag -> String
	*
	* html tag name, e.g. "p"
	*/
	tag;
	/**
	* Token#attrs -> Array
	*
	* Html attributes. Format: `[ [ name1, value1 ], [ name2, value2 ] ]`
	*/
	attrs;
	/**
	* Token#map -> Array
	*
	* Source map info. Format: `[ line_begin, line_end ]`
	*/
	map;
	/**
	* Token#nesting -> Number
	*
	* Level change (number in {-1, 0, 1} set), where:
	*
	* -  `1` means the tag is opening
	* -  `0` means the tag is self-closing
	* - `-1` means the tag is closing
	*/
	nesting;
	/**
	* Token#level -> Number
	*
	* nesting level, the same as `state.level`
	*/
	level;
	/**
	* Token#children -> Array
	*
	* An array of child nodes (inline and img tokens)
	*/
	children;
	/**
	* Token#content -> String
	*
	* In a case of self-closing tag (code, html, fence, etc.),
	* it has contents of this tag.
	*/
	content;
	/**
	* Token#markup -> String
	*
	* '*' or '_' for emphasis, fence string for fence, etc.
	*/
	markup;
	/**
	* Token#info -> String
	*
	* Additional information:
	*
	* - Info string for "fence" tokens
	* - The value "auto" for autolink "link_open" and "link_close" tokens
	* - The string value of the item marker for ordered-list "list_item_open" tokens
	*/
	info;
	/**
	* Token#meta -> Object
	*
	* A place for plugins to store an arbitrary data
	*/
	meta;
	/**
	* Token#block -> Boolean
	*
	* True for block-level tokens, false for inline tokens.
	* Used in renderer to calculate line breaks
	*/
	block;
	/**
	* Token#hidden -> Boolean
	*
	* If it's true, ignore this element when rendering. Used for tight lists
	* to hide paragraphs.
	*/
	hidden;
	constructor(type, tag, nesting) {
		this.type = type;
		this.tag = tag;
		this.attrs = null;
		this.map = null;
		this.nesting = nesting;
		this.level = 0;
		this.children = null;
		this.content = "";
		this.markup = "";
		this.info = "";
		this.meta = null;
		this.block = false;
		this.hidden = false;
	}
	/**
	* Token.attrIndex(name) -> Number
	*
	* Search attribute index by name.
	*/
	attrIndex(name) {
		if (!this.attrs) return -1;
		const attrs = this.attrs;
		for (let i = 0, len = attrs.length; i < len; i++) if (attrs[i][0] === name) return i;
		return -1;
	}
	/**
	* Token.attrPush(attrData)
	*
	* Add `[ name, value ]` attribute to list. Init attrs if necessary
	*/
	attrPush(attrData) {
		if (this.attrs) this.attrs.push(attrData);
		else this.attrs = [attrData];
	}
	/**
	* Token.attrSet(name, value)
	*
	* Set `name` attribute to `value`. Override old value if exists.
	*/
	attrSet(name, value) {
		const idx = this.attrIndex(name);
		const attrData = [name, value];
		if (idx < 0) this.attrPush(attrData);
		else this.attrs[idx] = attrData;
	}
	/**
	* Token.attrGet(name)
	*
	* Get the value of attribute `name`, or null if it does not exist.
	*/
	attrGet(name) {
		const idx = this.attrIndex(name);
		let value = null;
		if (idx >= 0) value = this.attrs[idx][1];
		return value;
	}
	/**
	* Token.attrJoin(name, value)
	*
	* Join value to existing attribute via space. Or create new attribute if not
	* exists. Useful to operate with token classes.
	*/
	attrJoin(name, value) {
		const idx = this.attrIndex(name);
		if (idx < 0) this.attrPush([name, value]);
		else this.attrs[idx][1] = `${this.attrs[idx][1]} ${value}`;
	}
};
/**
* Parse link destination: returns { ok, pos, str }
*/
function parseLinkDestination(str, start, max) {
	let code$1;
	let pos = start;
	const result = {
		ok: false,
		pos: 0,
		str: ""
	};
	if (str.charCodeAt(pos) === 60) {
		pos++;
		while (pos < max) {
			code$1 = str.charCodeAt(pos);
			if (code$1 === 10) return result;
			if (code$1 === 60) return result;
			if (code$1 === 62) {
				result.pos = pos + 1;
				result.str = unescapeAll$1(str.slice(start + 1, pos));
				result.ok = true;
				return result;
			}
			if (code$1 === 92 && pos + 1 < max) {
				pos += 2;
				continue;
			}
			pos++;
		}
		return result;
	}
	let level = 0;
	while (pos < max) {
		code$1 = str.charCodeAt(pos);
		if (code$1 === 32) break;
		if (code$1 < 32 || code$1 === 127) break;
		if (code$1 === 92 && pos + 1 < max) {
			if (str.charCodeAt(pos + 1) === 32) break;
			pos += 2;
			continue;
		}
		if (code$1 === 40) {
			level++;
			if (level > 32) return result;
		}
		if (code$1 === 41) {
			if (level === 0) break;
			level--;
		}
		pos++;
	}
	if (start === pos) return result;
	if (level !== 0) return result;
	result.str = unescapeAll$1(str.slice(start, pos));
	result.pos = pos;
	result.ok = true;
	return result;
}
var parse_link_destination_default = parseLinkDestination;
const FALLBACK_TO_INLINE_SCAN = -2;
function scanPlainLinkLabel(src, start, max) {
	let pos = start + 1;
	while (pos < max) {
		const marker = src.charCodeAt(pos);
		if (marker === 93) return pos;
		if (marker === 92) {
			pos += 2;
			continue;
		}
		if (marker === 96 || marker === 60) return FALLBACK_TO_INLINE_SCAN;
		if (marker === 33 && pos + 1 < max && src.charCodeAt(pos + 1) === 91) return FALLBACK_TO_INLINE_SCAN;
		if (marker === 91) return FALLBACK_TO_INLINE_SCAN;
		pos++;
	}
	return -1;
}
function parseLinkLabel(state, start, disableNested) {
	let level = 1;
	let found = false;
	let marker;
	let prevPos;
	const src = state.src;
	const max = state.posMax;
	const oldPos = state.pos;
	const noCloseFrom = state.__mdtsLinkLabelNoCloseFrom;
	if (typeof noCloseFrom === "number" && start + 1 >= noCloseFrom) return -1;
	const nextClose = src.indexOf("]", start + 1);
	if (nextClose < 0 || nextClose >= max) {
		state.__mdtsLinkLabelNoCloseFrom = start + 1;
		return -1;
	}
	const fastLabelEnd = scanPlainLinkLabel(src, start, max);
	if (fastLabelEnd !== FALLBACK_TO_INLINE_SCAN) return fastLabelEnd;
	state.pos = start + 1;
	while (state.pos < max) {
		marker = src.charCodeAt(state.pos);
		if (marker === 93) {
			level--;
			if (level === 0) {
				found = true;
				break;
			}
		}
		prevPos = state.pos;
		state.md.inline.skipToken(state);
		if (marker === 91) {
			if (prevPos === state.pos - 1) level++;
			else if (disableNested) {
				state.pos = oldPos;
				return -1;
			}
		}
	}
	let labelEnd = -1;
	if (found) labelEnd = state.pos;
	state.pos = oldPos;
	return labelEnd;
}
var parse_link_label_default = parseLinkLabel;
/**
* Parse link title: returns { ok, can_continue, pos, str, marker }
*/
function parseLinkTitle(str, start, max, prev_state) {
	let code$1;
	let pos = start;
	const state = {
		ok: false,
		can_continue: false,
		pos: 0,
		str: "",
		marker: 0
	};
	if (prev_state) {
		state.str = prev_state.str;
		state.marker = prev_state.marker;
	} else {
		if (pos >= max) return state;
		let marker = str.charCodeAt(pos);
		if (marker !== 34 && marker !== 39 && marker !== 40) return state;
		start++;
		pos++;
		if (marker === 40) marker = 41;
		state.marker = marker;
	}
	while (pos < max) {
		code$1 = str.charCodeAt(pos);
		if (code$1 === state.marker) {
			state.pos = pos + 1;
			state.str += unescapeAll$1(str.slice(start, pos));
			state.ok = true;
			return state;
		} else if (code$1 === 40 && state.marker === 41) return state;
		else if (code$1 === 92 && pos + 1 < max) pos++;
		pos++;
	}
	state.can_continue = true;
	state.str += unescapeAll$1(str.slice(start, pos));
	return state;
}
var parse_link_title_default = parseLinkTitle;
function attrIndex(token, name) {
	if (!token.attrs) return -1;
	for (let i = 0; i < token.attrs.length; i++) if (token.attrs[i][0] === name) return i;
	return -1;
}
function attrPush(token, attrData) {
	if (!token.attrs) token.attrs = [];
	token.attrs.push(attrData);
}
function attrSet(token, name, value) {
	const idx = attrIndex(token, name);
	const attrData = [name, value];
	if (idx < 0) attrPush(token, attrData);
	else token.attrs[idx] = attrData;
}
function attrGet(token, name) {
	const idx = attrIndex(token, name);
	if (idx >= 0) return token.attrs[idx][1];
	return null;
}
function attrJoin(token, name, value) {
	const idx = attrIndex(token, name);
	if (idx < 0) attrPush(token, [name, value]);
	else token.attrs[idx][1] = `${token.attrs[idx][1]} ${value}`;
}
var helpers_exports = /* @__PURE__ */ __export({
	attrGet: () => attrGet,
	attrIndex: () => attrIndex,
	attrJoin: () => attrJoin,
	attrPush: () => attrPush,
	attrSet: () => attrSet,
	parseLinkDestination: () => parseLinkDestination,
	parseLinkLabel: () => parseLinkLabel,
	parseLinkTitle: () => parseLinkTitle
});
function hasNormalizationChars(src) {
	return src.includes("\r") || src.includes("\0");
}
function sourceToString(src) {
	return typeof src === "string" ? src : src.toString();
}
/**
* Core rule: block
* Runs block-level parser on the input.
*/
function block(state) {
	if (state.inlineMode) {
		const token = new Token("inline", "", 0);
		token.content = sourceToString(state.src);
		token.map = [0, 1];
		token.children = [];
		token.level = 0;
		state.tokens.push(token);
	} else if (state.md && state.md.block) state.md.block.parse(state.src, state.md, state.env, state.tokens);
}
/**
* Process autolinks '<protocol:...>'
*/
const EMAIL_RE = /^([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)$/;
const AUTOLINK_RE = /^([a-zA-Z][a-zA-Z0-9+.-]{1,31}):([^<>\x00-\x20]*)$/;
function autolink(state, silent) {
	let pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 60) return false;
	const start = pos;
	const max = state.posMax;
	for (;;) {
		if (++pos >= max) return false;
		const ch = src.charCodeAt(pos);
		if (ch === 60) return false;
		if (ch === 62) break;
	}
	const url = src.slice(start + 1, pos);
	if (AUTOLINK_RE.test(url)) {
		const fullUrl = state.md.normalizeLink(url);
		if (!state.md.validateLink(fullUrl)) return false;
		if (!silent) {
			const token_o = state.push("link_open", "a", 1);
			token_o.attrs = [["href", fullUrl]];
			token_o.markup = "autolink";
			token_o.info = "auto";
			const token_t = state.push("text", "", 0);
			token_t.content = state.md.normalizeLinkText(url);
			const token_c = state.push("link_close", "a", -1);
			token_c.markup = "autolink";
			token_c.info = "auto";
		}
		state.pos += url.length + 2;
		return true;
	}
	if (EMAIL_RE.test(url)) {
		const fullUrl = state.md.normalizeLink(`mailto:${url}`);
		if (!state.md.validateLink(fullUrl)) return false;
		if (!silent) {
			const token_o = state.push("link_open", "a", 1);
			token_o.attrs = [["href", fullUrl]];
			token_o.markup = "autolink";
			token_o.info = "auto";
			const token_t = state.push("text", "", 0);
			token_t.content = state.md.normalizeLinkText(url);
			const token_c = state.push("link_close", "a", -1);
			token_c.markup = "autolink";
			token_c.info = "auto";
		}
		state.pos += url.length + 2;
		return true;
	}
	return false;
}
var autolink_default = autolink;
/**
* Parse backticks (inline code)
*/
function backticks(state, silent) {
	const src = state.src;
	let pos = state.pos;
	if (src.charCodeAt(pos) !== 96) return false;
	const start = pos;
	pos++;
	const max = state.posMax;
	while (pos < max && src.charCodeAt(pos) === 96) pos++;
	const marker = src.slice(start, pos);
	const openerLength = marker.length;
	if (state.backticksScanned && (state.backticks[openerLength] || 0) <= start) {
		if (!silent) state.pending += marker;
		state.pos += openerLength;
		return true;
	}
	let matchEnd = pos;
	let matchStart;
	while ((matchStart = src.indexOf("`", matchEnd)) !== -1) {
		matchEnd = matchStart + 1;
		while (matchEnd < max && src.charCodeAt(matchEnd) === 96) matchEnd++;
		const closerLength = matchEnd - matchStart;
		if (closerLength === openerLength) {
			if (!silent) {
				const token = state.push("code_inline", "code", 0);
				token.markup = marker;
				let content = src.slice(pos, matchStart);
				if (content.includes("\n")) content = content.replace(/\n/g, " ");
				if (content.length > 2 && content.charCodeAt(0) === 32 && content.charCodeAt(content.length - 1) === 32) content = content.slice(1, -1);
				token.content = content;
			}
			state.pos = matchEnd;
			return true;
		}
		state.backticks[closerLength] = matchStart;
	}
	state.backticksScanned = true;
	if (!silent) state.pending += marker;
	state.pos += openerLength;
	return true;
}
var backticks_default = backticks;
function processDelimiters(delimiters) {
	const openersBottom = {};
	const max = delimiters.length;
	if (!max) return;
	let headerIdx = 0;
	let lastTokenIdx = -2;
	const jumps = [];
	for (let closerIdx = 0; closerIdx < max; closerIdx++) {
		const closer = delimiters[closerIdx];
		jumps.push(0);
		if (delimiters[headerIdx].marker !== closer.marker || lastTokenIdx !== closer.token - 1) headerIdx = closerIdx;
		lastTokenIdx = closer.token;
		closer.length = closer.length || 0;
		if (!closer.close) continue;
		if (!Object.prototype.hasOwnProperty.call(openersBottom, closer.marker)) openersBottom[closer.marker] = [
			-1,
			-1,
			-1,
			-1,
			-1,
			-1
		];
		const minOpenerIdx = openersBottom[closer.marker][(closer.open ? 3 : 0) + closer.length % 3];
		let openerIdx = headerIdx - jumps[headerIdx] - 1;
		let newMinOpenerIdx = openerIdx;
		for (; openerIdx > minOpenerIdx; openerIdx -= jumps[openerIdx] + 1) {
			const opener = delimiters[openerIdx];
			if (opener.marker !== closer.marker) continue;
			if (opener.open && opener.end < 0) {
				let isOddMatch = false;
				if (opener.close || closer.open) {
					if ((opener.length + closer.length) % 3 === 0) {
						if (opener.length % 3 !== 0 || closer.length % 3 !== 0) isOddMatch = true;
					}
				}
				if (!isOddMatch) {
					const lastJump = openerIdx > 0 && !delimiters[openerIdx - 1].open ? jumps[openerIdx - 1] + 1 : 0;
					jumps[closerIdx] = closerIdx - openerIdx + lastJump;
					jumps[openerIdx] = lastJump;
					closer.open = false;
					opener.end = closerIdx;
					opener.close = false;
					newMinOpenerIdx = -1;
					lastTokenIdx = -2;
					break;
				}
			}
		}
		if (newMinOpenerIdx !== -1) openersBottom[closer.marker][(closer.open ? 3 : 0) + (closer.length || 0) % 3] = newMinOpenerIdx;
	}
}
function balance_pairs(state) {
	const tokens_meta = state.tokens_meta;
	const max = state.tokens_meta.length;
	processDelimiters(state.delimiters);
	for (let curr = 0; curr < max; curr++) if (tokens_meta[curr] && tokens_meta[curr].delimiters) processDelimiters(tokens_meta[curr].delimiters);
}
var balance_pairs_default = balance_pairs;
function emphasis_tokenize(state, silent) {
	const start = state.pos;
	const marker = state.src.charCodeAt(start);
	if (silent) return false;
	if (marker !== 95 && marker !== 42) return false;
	const scanned = state.scanDelims(state.pos, marker === 42);
	if (!scanned || scanned.length === 0) return false;
	for (let i = 0; i < scanned.length; i++) {
		const token = state.push("text", "", 0);
		token.content = String.fromCharCode(marker);
		state.delimiters.push({
			marker,
			length: scanned.length,
			token: state.tokens.length - 1,
			end: -1,
			open: scanned.can_open,
			close: scanned.can_close
		});
	}
	state.pos += scanned.length;
	return true;
}
function postProcess$1(state, delimiters) {
	const max = delimiters.length;
	for (let i = max - 1; i >= 0; i--) {
		const startDelim = delimiters[i];
		if (startDelim.marker !== 95 && startDelim.marker !== 42) continue;
		if (startDelim.end === -1) continue;
		const endDelim = delimiters[startDelim.end];
		const isStrong = i > 0 && delimiters[i - 1].end === startDelim.end + 1 && delimiters[i - 1].marker === startDelim.marker && delimiters[i - 1].token === startDelim.token - 1 && delimiters[startDelim.end + 1].token === endDelim.token + 1;
		const ch = String.fromCharCode(startDelim.marker);
		const token_o = state.tokens[startDelim.token];
		token_o.type = isStrong ? "strong_open" : "em_open";
		token_o.tag = isStrong ? "strong" : "em";
		token_o.nesting = 1;
		token_o.markup = isStrong ? ch + ch : ch;
		token_o.content = "";
		const token_c = state.tokens[endDelim.token];
		token_c.type = isStrong ? "strong_close" : "em_close";
		token_c.tag = isStrong ? "strong" : "em";
		token_c.nesting = -1;
		token_c.markup = isStrong ? ch + ch : ch;
		token_c.content = "";
		if (isStrong) {
			state.tokens[delimiters[i - 1].token].content = "";
			state.tokens[delimiters[startDelim.end + 1].token].content = "";
			i--;
		}
	}
}
function emphasis_postProcess(state) {
	const tokens_meta = state.tokens_meta;
	const max = state.tokens_meta.length;
	postProcess$1(state, state.delimiters);
	for (let curr = 0; curr < max; curr++) if (tokens_meta[curr] && tokens_meta[curr].delimiters) postProcess$1(state, tokens_meta[curr].delimiters);
}
const emphasis = {
	tokenize: emphasis_tokenize,
	postProcess: emphasis_postProcess
};
function decodeHTML$1(str) {
	return decodeHTML(str);
}
function isDigit$1(code$1) {
	return code$1 >= 48 && code$1 <= 57;
}
function isHexDigit(code$1) {
	const lower = code$1 | 32;
	return isDigit$1(code$1) || lower >= 97 && lower <= 102;
}
function isAsciiLetter$1(code$1) {
	const lower = code$1 | 32;
	return lower >= 97 && lower <= 122;
}
function isAsciiAlphaNum(code$1) {
	return isAsciiLetter$1(code$1) || isDigit$1(code$1);
}
function scanNumericEntity(src, start, max) {
	let pos = start + 2;
	if (pos >= max) return null;
	let isHex = false;
	let digitLimit = 7;
	let digitStart = pos;
	if ((src.charCodeAt(pos) | 32) === 120) {
		isHex = true;
		digitLimit = 6;
		pos++;
		digitStart = pos;
	}
	while (pos < max && pos - digitStart < digitLimit) {
		const ch = src.charCodeAt(pos);
		if (!(isHex ? isHexDigit(ch) : isDigit$1(ch))) break;
		pos++;
	}
	if (pos === digitStart || pos >= max) return null;
	if (src.charCodeAt(pos) !== 59) return null;
	return src.slice(start, pos + 1);
}
function scanNamedEntity(src, start, max) {
	let pos = start + 1;
	if (pos >= max || !isAsciiLetter$1(src.charCodeAt(pos))) return null;
	pos++;
	while (pos < max && pos - start - 1 < 32 && isAsciiAlphaNum(src.charCodeAt(pos))) pos++;
	if (pos - start - 1 < 2 || pos >= max || src.charCodeAt(pos) !== 59) return null;
	const markup = src.slice(start, pos + 1);
	return decodeHTML$1(markup) !== markup ? markup : null;
}
function entity(state, silent) {
	const pos = state.pos;
	const max = state.posMax;
	if (state.src.charCodeAt(pos) !== 38) return false;
	if (pos + 1 >= max) return false;
	if (state.src.charCodeAt(pos + 1) === 35) {
		const markup = scanNumericEntity(state.src, pos, max);
		if (markup) {
			if (!silent) {
				const code$1 = (markup.charCodeAt(2) | 32) === 120 ? Number.parseInt(markup.slice(3, -1), 16) : Number.parseInt(markup.slice(2, -1), 10);
				const token = state.push("text_special", "", 0);
				token.content = isValidEntityCode(code$1) ? fromCodePoint(code$1) : fromCodePoint(65533);
				token.markup = markup;
				token.info = "entity";
			}
			state.pos += markup.length;
			return true;
		}
	} else {
		const markup = scanNamedEntity(state.src, pos, max);
		if (markup) {
			const decoded = decodeHTML$1(markup);
			if (!silent) {
				const token = state.push("text_special", "", 0);
				token.content = decoded;
				token.markup = markup;
				token.info = "entity";
			}
			state.pos += markup.length;
			return true;
		}
	}
	return false;
}
var entity_default = entity;
const ESCAPED = (() => {
	const table$1 = new Array(256).fill(0);
	const chars = "\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-";
	for (let i = 0; i < 32; i++) table$1[chars.charCodeAt(i)] = 1;
	return table$1;
})();
const ESCAPED_MARKUP = new Array(128);
const ESCAPED_CONTENT = new Array(128);
for (let i = 0; i < 128; i++) {
	const ch = String.fromCharCode(i);
	ESCAPED_MARKUP[i] = `\\${ch}`;
	ESCAPED_CONTENT[i] = ESCAPED[i] ? ch : ESCAPED_MARKUP[i];
}
function pushEscapeToken(state, content, markup) {
	if (state.pending) state.pushPending();
	const token = new Token("text_special", "", 0);
	token.level = state.level;
	token.content = content;
	token.markup = markup;
	token.info = "escape";
	state.pendingLevel = state.level;
	state.tokens.push(token);
	state.tokens_meta.push(null);
}
function escape(state, silent) {
	let pos = state.pos;
	const max = state.posMax;
	const src = state.src;
	if (src.charCodeAt(pos) !== 92) return false;
	pos++;
	if (pos >= max) return false;
	let ch = src.charCodeAt(pos);
	if (ch === 10) {
		if (!silent) state.push("hardbreak", "br", 0);
		pos++;
		while (pos < max) {
			ch = src.charCodeAt(pos);
			if (ch !== 9 && ch !== 32) break;
			pos++;
		}
		state.pos = pos;
		return true;
	}
	if (ch < 128) {
		if (silent) {
			state.pos = pos + 1;
			return true;
		}
		pushEscapeToken(state, ESCAPED_CONTENT[ch], ESCAPED_MARKUP[ch]);
		state.pos = pos + 1;
		return true;
	}
	if (silent) {
		if (ch >= 55296 && ch <= 56319 && pos + 1 < max) {
			const ch2 = src.charCodeAt(pos + 1);
			if (ch2 >= 56320 && ch2 <= 57343) pos++;
		}
		state.pos = pos + 1;
		return true;
	}
	let escapedStr = src.charAt(pos);
	if (ch >= 55296 && ch <= 56319 && pos + 1 < max) {
		const ch2 = src.charCodeAt(pos + 1);
		if (ch2 >= 56320 && ch2 <= 57343) {
			escapedStr += src.charAt(pos + 1);
			pos++;
		}
	}
	const origStr = `\\${escapedStr}`;
	pushEscapeToken(state, ch < 256 && ESCAPED[ch] ? escapedStr : origStr, origStr);
	state.pos = pos + 1;
	return true;
}
var escape_default = escape;
function fragments_join(state) {
	let curr, last;
	let level = 0;
	const tokens = state.tokens;
	const max = state.tokens.length;
	for (curr = last = 0; curr < max; curr++) {
		const token = tokens[curr];
		if (!token) continue;
		if (token.nesting && token.nesting < 0) level--;
		token.level = level;
		if (token.nesting && token.nesting > 0) level++;
		if (token.type === "text" && curr + 1 < max && tokens[curr + 1]?.type === "text") tokens[curr + 1].content = token.content + tokens[curr + 1].content;
		else {
			if (curr !== last) tokens[last] = token;
			last++;
		}
	}
	if (curr !== last) tokens.length = last;
}
var fragments_join_default = fragments_join;
const open_tag = `<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"'=<>\`\\x00-\\x20]+|'[^']*'|"[^"]*"))?)*\\s*\\/?>`;
const close_tag = "<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>";
const HTML_TAG_RE = /* @__PURE__ */ new RegExp(`^(?:${open_tag}|${close_tag}|<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->|<\\?[\\s\\S]*?\\?>|<![A-Za-z][^>]*>|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)`);
const HTML_OPEN_CLOSE_TAG_RE = /* @__PURE__ */ new RegExp(`^(?:${open_tag}|${close_tag})`);
function isHtmlSpace(code$1) {
	return code$1 === 32 || code$1 === 9 || code$1 === 10 || code$1 === 12 || code$1 === 13;
}
function isLinkOpen$1(str) {
	if (str.length < 3) return false;
	if (str.charCodeAt(0) !== 60) return false;
	if ((str.charCodeAt(1) | 32) !== 97) return false;
	const ch = str.charCodeAt(2);
	return ch === 62 || isHtmlSpace(ch);
}
function isLinkClose$1(str) {
	if (str.length < 4) return false;
	if (str.charCodeAt(0) !== 60 || str.charCodeAt(1) !== 47) return false;
	if ((str.charCodeAt(2) | 32) !== 97) return false;
	for (let i = 3; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		if (ch === 62) return true;
		if (!isHtmlSpace(ch)) return false;
	}
	return false;
}
function isLetter(ch) {
	const lc = ch | 32;
	return lc >= 97 && lc <= 122;
}
function html_inline(state, silent) {
	if (!state.md.options.html) return false;
	const max = state.posMax;
	const pos = state.pos;
	const src = state.src;
	if (src.charCodeAt(pos) !== 60 || pos + 2 >= max) return false;
	const ch = src.charCodeAt(pos + 1);
	if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter(ch)) return false;
	const match = src.slice(pos).match(HTML_TAG_RE);
	if (!match) return false;
	const markup = match[0];
	if (!silent) {
		const token = state.pushSimple("html_inline", "");
		token.content = markup;
		if (isLinkOpen$1(markup)) state.linkLevel++;
		if (isLinkClose$1(markup)) state.linkLevel--;
	}
	state.pos += markup.length;
	return true;
}
var html_inline_default = html_inline;
function image(state, silent) {
	let code$1, content, label, pos, ref, res, title, start;
	let href = "";
	const oldPos = state.pos;
	const max = state.posMax;
	if (state.src.charCodeAt(state.pos) !== 33) return false;
	if (state.src.charCodeAt(state.pos + 1) !== 91) return false;
	const labelStart = state.pos + 2;
	const labelEnd = parse_link_label_default(state, state.pos + 1, false);
	if (labelEnd < 0) return false;
	pos = labelEnd + 1;
	if (pos < max && state.src.charCodeAt(pos) === 40) {
		pos++;
		for (; pos < max; pos++) {
			code$1 = state.src.charCodeAt(pos);
			if (code$1 !== 32 && code$1 !== 10) break;
		}
		if (pos >= max) return false;
		res = parse_link_destination_default(state.src, pos, state.posMax);
		if (res.ok) {
			href = state.md.normalizeLink(res.str);
			if (state.md.validateLink(href)) pos = res.pos;
			else href = "";
			start = pos;
			for (; pos < max; pos++) {
				code$1 = state.src.charCodeAt(pos);
				if (code$1 !== 32 && code$1 !== 10) break;
			}
			res = parse_link_title_default(state.src, pos, state.posMax);
			if (pos < max && start !== pos && res.ok) {
				title = res.str;
				pos = res.pos;
				for (; pos < max; pos++) {
					code$1 = state.src.charCodeAt(pos);
					if (code$1 !== 32 && code$1 !== 10) break;
				}
			} else title = "";
		}
		if (pos >= max || state.src.charCodeAt(pos) !== 41) {
			state.pos = oldPos;
			return false;
		}
		pos++;
	} else {
		if (typeof state.env.references === "undefined") return false;
		if (pos < max && state.src.charCodeAt(pos) === 91) {
			start = pos + 1;
			pos = parse_link_label_default(state, pos);
			if (pos >= 0) label = state.src.slice(start, pos++);
			else pos = labelEnd + 1;
		} else pos = labelEnd + 1;
		if (!label) label = state.src.slice(labelStart, labelEnd);
		ref = state.env.references[normalizeReference(label)];
		if (!ref) {
			state.pos = oldPos;
			return false;
		}
		href = ref.href;
		title = ref.title;
	}
	if (!silent) {
		content = state.src.slice(labelStart, labelEnd);
		const tokens = [];
		state.md.inline.parse(content, state.md, state.env, tokens);
		const token = state.push("image", "img", 0);
		token.attrs = [["src", href], ["alt", ""]];
		token.children = tokens;
		token.content = content;
		if (title) token.attrs.push(["title", title]);
	}
	state.pos = pos;
	state.posMax = max;
	return true;
}
var image_default = image;
function link(state, silent) {
	let code$1, label, res, ref;
	let href = "";
	let title = "";
	let start = state.pos;
	let parseReference = true;
	if (state.src.charCodeAt(state.pos) !== 91) return false;
	const oldPos = state.pos;
	const max = state.posMax;
	const labelStart = state.pos + 1;
	const labelEnd = parse_link_label_default(state, state.pos, true);
	if (labelEnd < 0) return false;
	let pos = labelEnd + 1;
	if (pos < max && state.src.charCodeAt(pos) === 40) {
		parseReference = false;
		pos++;
		for (; pos < max; pos++) {
			code$1 = state.src.charCodeAt(pos);
			if (code$1 !== 32 && code$1 !== 10) break;
		}
		if (pos >= max) return false;
		res = parse_link_destination_default(state.src, pos, state.posMax);
		if (res.ok) {
			href = state.md.normalizeLink(res.str);
			if (state.md.validateLink(href)) pos = res.pos;
			else href = "";
			start = pos;
			for (; pos < max; pos++) {
				code$1 = state.src.charCodeAt(pos);
				if (code$1 !== 32 && code$1 !== 10) break;
			}
			res = parse_link_title_default(state.src, pos, state.posMax);
			if (pos < max && start !== pos && res.ok) {
				title = res.str;
				pos = res.pos;
				for (; pos < max; pos++) {
					code$1 = state.src.charCodeAt(pos);
					if (code$1 !== 32 && code$1 !== 10) break;
				}
			}
		}
		if (pos >= max || state.src.charCodeAt(pos) !== 41) parseReference = true;
		pos++;
	}
	if (parseReference) {
		if (typeof state.env.references === "undefined") return false;
		if (pos < max && state.src.charCodeAt(pos) === 91) {
			start = pos + 1;
			pos = parse_link_label_default(state, pos);
			if (pos >= 0) label = state.src.slice(start, pos++);
			else pos = labelEnd + 1;
		} else pos = labelEnd + 1;
		if (!label) label = state.src.slice(labelStart, labelEnd);
		ref = state.env.references[normalizeReference(label)];
		if (!ref) {
			state.pos = oldPos;
			return false;
		}
		href = ref.href;
		title = ref.title;
	}
	if (!silent) {
		state.pos = labelStart;
		state.posMax = labelEnd;
		const token_o = state.push("link_open", "a", 1);
		const attrs = [["href", href]];
		token_o.attrs = attrs;
		if (title) attrs.push(["title", title]);
		state.linkLevel++;
		state.md.inline.tokenize(state);
		state.linkLevel--;
		state.push("link_close", "a", -1);
	}
	state.pos = pos;
	state.posMax = max;
	return true;
}
var link_default = link;
function isAsciiLetter(code$1) {
	const lower = code$1 | 32;
	return lower >= 97 && lower <= 122;
}
function isDigit(code$1) {
	return code$1 >= 48 && code$1 <= 57;
}
function isSchemeChar(code$1) {
	return isAsciiLetter(code$1) || isDigit(code$1) || code$1 === 43 || code$1 === 45 || code$1 === 46;
}
function extractTrailingScheme(pending) {
	if (pending.length === 0) return null;
	let start = pending.length - 1;
	while (start >= 0 && isSchemeChar(pending.charCodeAt(start))) start--;
	start++;
	if (start >= pending.length || !isAsciiLetter(pending.charCodeAt(start))) return null;
	return pending.slice(start);
}
function scanLinkifyCandidate(src, start, max) {
	let end = start;
	while (end < max) {
		const ch = src.charCodeAt(end);
		if (ch <= 32 || ch === 127 || ch === 60) break;
		end++;
	}
	return src.slice(start, end);
}
function linkify$1(state, silent) {
	if (!state.md.options.linkify) return false;
	if (state.linkLevel > 0) return false;
	const pos = state.pos;
	const max = state.posMax;
	if (pos + 3 > max) return false;
	if (state.src.charCodeAt(pos) !== 58) return false;
	if (state.src.charCodeAt(pos + 1) !== 47) return false;
	if (state.src.charCodeAt(pos + 2) !== 47) return false;
	const proto = extractTrailingScheme(state.pending);
	if (!proto) return false;
	const candidate = scanLinkifyCandidate(state.src, pos - proto.length, max);
	const link$1 = state.md.linkify.matchAtStart(candidate);
	if (!link$1) return false;
	let url = link$1.url;
	if (url.length <= proto.length) return false;
	let urlEnd = url.length;
	while (urlEnd > 0 && url.charCodeAt(urlEnd - 1) === 42) urlEnd--;
	if (urlEnd !== url.length) url = url.slice(0, urlEnd);
	const fullUrl = state.md.normalizeLink(url);
	if (!state.md.validateLink(fullUrl)) return false;
	if (!silent) {
		state.pending = state.pending.slice(0, -proto.length);
		const token_o = state.push("link_open", "a", 1);
		token_o.attrs = [["href", fullUrl]];
		token_o.markup = "linkify";
		token_o.info = "auto";
		const token_t = state.push("text", "", 0);
		token_t.content = state.md.normalizeLinkText(url);
		const token_c = state.push("link_close", "a", -1);
		token_c.markup = "linkify";
		token_c.info = "auto";
	}
	state.pos += url.length - proto.length;
	return true;
}
/**
* Inline rule: newline
* Process newlines
*/
function newline(state, silent) {
	let pos = state.pos;
	if (state.src.charCodeAt(pos) !== 10) return false;
	const pmax = state.pending.length - 1;
	const max = state.posMax;
	if (!silent) if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
		let ws = pmax - 1;
		while (ws >= 1 && state.pending.charCodeAt(ws - 1) === 32) ws--;
		state.pending = state.pending.slice(0, ws);
		state.pushSimple("hardbreak", "br");
	} else {
		state.pending = state.pending.slice(0, -1);
		state.pushSimple("softbreak", "br");
	}
	else state.pushSimple("softbreak", "br");
	pos++;
	while (pos < max) {
		const ch = state.src.charCodeAt(pos);
		if (ch !== 9 && ch !== 32) break;
		pos++;
	}
	state.pos = pos;
	return true;
}
var newline_default = newline;
function strikethrough_tokenize(state, silent) {
	const start = state.pos;
	const marker = state.src.charCodeAt(start);
	if (silent) return false;
	if (marker !== 126) return false;
	const scanned = state.scanDelims(state.pos, true);
	if (!scanned) return false;
	let len = scanned.length;
	const ch = String.fromCharCode(marker);
	if (len < 2) return false;
	let token;
	if (len % 2) {
		token = state.push("text", "", 0);
		token.content = ch;
		len--;
	}
	for (let i = 0; i < len; i += 2) {
		token = state.push("text", "", 0);
		token.content = ch + ch;
		state.delimiters.push({
			marker,
			length: 0,
			token: state.tokens.length - 1,
			end: -1,
			open: scanned.can_open,
			close: scanned.can_close
		});
	}
	state.pos += scanned.length;
	return true;
}
function postProcess(state, delimiters) {
	let token;
	const loneMarkers = [];
	const max = delimiters.length;
	for (let i = 0; i < max; i++) {
		const startDelim = delimiters[i];
		if (startDelim.marker !== 126) continue;
		if (startDelim.end === -1) continue;
		const endDelim = delimiters[startDelim.end];
		token = state.tokens[startDelim.token];
		token.type = "s_open";
		token.tag = "s";
		token.nesting = 1;
		token.markup = "~~";
		token.content = "";
		token = state.tokens[endDelim.token];
		token.type = "s_close";
		token.tag = "s";
		token.nesting = -1;
		token.markup = "~~";
		token.content = "";
		if (state.tokens[endDelim.token - 1].type === "text" && state.tokens[endDelim.token - 1].content === "~") loneMarkers.push(endDelim.token - 1);
	}
	while (loneMarkers.length) {
		const i = loneMarkers.pop();
		let j = i + 1;
		while (j < state.tokens.length && state.tokens[j].type === "s_close") j++;
		j--;
		if (i !== j) {
			token = state.tokens[j];
			state.tokens[j] = state.tokens[i];
			state.tokens[i] = token;
		}
	}
}
function strikethrough_postProcess(state) {
	const delimiters = state.delimiters;
	postProcess(state, delimiters);
	const tokens_meta = state.tokens_meta;
	if (tokens_meta) {
		for (let curr = 0; curr < tokens_meta.length; curr++) if (tokens_meta[curr] && tokens_meta[curr].delimiters) postProcess(state, tokens_meta[curr].delimiters);
	}
}
const strikethrough = {
	tokenize: strikethrough_tokenize,
	postProcess: strikethrough_postProcess
};
/**
* Inline rule: text
* Skip text characters for text token, place those to pending buffer
* and increment current pos
*/
function isTerminatorChar(ch) {
	switch (ch) {
		case 10:
		case 33:
		case 35:
		case 36:
		case 37:
		case 38:
		case 42:
		case 43:
		case 45:
		case 58:
		case 60:
		case 61:
		case 62:
		case 64:
		case 91:
		case 92:
		case 93:
		case 94:
		case 95:
		case 96:
		case 123:
		case 125:
		case 126: return true;
		default: return false;
	}
}
function text(state, silent) {
	const src = state.src;
	const start = state.pos;
	const max = state.posMax;
	if (start >= max || isTerminatorChar(src.charCodeAt(start))) return false;
	let pos = start + 1;
	while (pos < max && !isTerminatorChar(src.charCodeAt(pos))) pos++;
	if (!silent) state.pending += pos === start + 1 ? src.charAt(start) : src.slice(start, pos);
	state.pos = pos;
	return true;
}
var text_default = text;
function now() {
	if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
	return Date.now();
}
function median(values) {
	if (values.length === 0) return 0;
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function createRecord(chain, name) {
	return {
		chain,
		name,
		calls: 0,
		hits: 0,
		inclusiveMs: 0,
		medianMs: 0,
		maxMs: 0,
		normalCalls: 0,
		normalHits: 0,
		silentCalls: 0,
		silentHits: 0,
		samples: []
	};
}
function getRuleProfile(env) {
	const carrier = env;
	if (!carrier) return null;
	if (carrier.__mdtsRuleProfile) return carrier.__mdtsRuleProfile;
	if (!carrier.__mdtsProfileRules) return null;
	const meta = carrier.__mdtsProfileRules === true ? {} : carrier.__mdtsProfileRules;
	const session = {
		enabled: true,
		fixture: meta.fixture,
		mode: meta.mode,
		startedAt: now(),
		records: Object.create(null)
	};
	carrier.__mdtsRuleProfile = session;
	return session;
}
function recordRuleInvocation(env, chain, name, durationMs, hit, silent) {
	const session = getRuleProfile(env);
	if (!session) return;
	const key = `${chain}:${name}`;
	const record = session.records[key] ?? (session.records[key] = createRecord(chain, name));
	record.calls++;
	record.inclusiveMs += durationMs;
	if (durationMs > record.maxMs) record.maxMs = durationMs;
	record.samples.push(durationMs);
	if (silent) {
		record.silentCalls++;
		if (hit) record.silentHits++;
	} else {
		record.normalCalls++;
		if (hit) record.normalHits++;
	}
	if (hit) record.hits++;
	session.completedAt = now();
}
function finalizeRuleProfile(env) {
	const session = getRuleProfile(env);
	if (!session) return null;
	const records = Object.keys(session.records);
	for (let i = 0; i < records.length; i++) {
		const record = session.records[records[i]];
		record.medianMs = median(record.samples);
	}
	session.completedAt = now();
	return session;
}
var InlineRuler = class {
	rules = [];
	cache = null;
	namedCache = null;
	version = 0;
	invalidateCache() {
		this.cache = null;
		this.namedCache = null;
		this.version++;
	}
	/**
	* Push new rule to the end of chain
	*/
	push(name, fn, options) {
		const idx = this.rules.findIndex((r) => r.name === name);
		if (idx >= 0) this.rules.splice(idx, 1);
		this.rules.push({
			name,
			fn,
			alt: options?.alt || [],
			enabled: true
		});
		this.invalidateCache();
	}
	at(name, fn, options) {
		const index = this.rules.findIndex((rule) => rule.name === name);
		if (fn === void 0) {
			if (index < 0) return void 0;
			const rule = this.rules[index];
			return Object.freeze({
				name: rule.name,
				fn: rule.fn,
				alt: rule.alt ? Object.freeze(rule.alt.slice()) : void 0,
				enabled: rule.enabled
			});
		}
		if (index < 0) throw new Error(`Parser rule not found: ${name}`);
		this.rules[index].fn = fn;
		if (options?.alt !== void 0) this.rules[index].alt = options.alt;
		this.invalidateCache();
	}
	before(beforeName, name, fn, options) {
		const i = this.rules.findIndex((r) => r.name === beforeName);
		if (i < 0) throw new Error(`Parser rule not found: ${beforeName}`);
		const exists = this.rules.findIndex((r) => r.name === name);
		if (exists >= 0) this.rules.splice(exists, 1);
		this.rules.splice(i, 0, {
			name,
			fn,
			alt: options?.alt || [],
			enabled: true
		});
		this.invalidateCache();
	}
	after(afterName, name, fn, options) {
		const i = this.rules.findIndex((r) => r.name === afterName);
		if (i < 0) throw new Error(`Parser rule not found: ${afterName}`);
		const exists = this.rules.findIndex((r) => r.name === name);
		if (exists >= 0) this.rules.splice(exists, 1);
		this.rules.splice(i + 1, 0, {
			name,
			fn,
			alt: options?.alt || [],
			enabled: true
		});
		this.invalidateCache();
	}
	enable(names, ignoreInvalid) {
		const list$1 = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		for (const n of list$1) {
			const idx = this.rules.findIndex((r) => r.name === n);
			if (idx < 0) {
				if (!ignoreInvalid) throw new Error(`Rules manager: invalid rule name ${n}`);
				continue;
			}
			found.push(n);
			if (!this.rules[idx].enabled) {
				this.rules[idx].enabled = true;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
		return found;
	}
	disable(names, ignoreInvalid) {
		const list$1 = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		for (const n of list$1) {
			const idx = this.rules.findIndex((r) => r.name === n);
			if (idx < 0) {
				if (!ignoreInvalid) throw new Error(`Rules manager: invalid rule name ${n}`);
				continue;
			}
			found.push(n);
			if (this.rules[idx].enabled) {
				this.rules[idx].enabled = false;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
		return found;
	}
	enableOnly(names) {
		const allow = new Set(names);
		let changed = false;
		for (const r of this.rules) {
			const next = allow.has(r.name);
			if (r.enabled !== next) {
				r.enabled = next;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
	}
	/**
	* Get rules for specified chain name (or empty string for default)
	*/
	getRules(chainName) {
		const chain = chainName || "";
		if (!this.cache) this.compileCache();
		return this.cache.get(chain) ?? [];
	}
	getNamedRules(chainName) {
		const chain = chainName || "";
		if (!this.namedCache) this.compileCache();
		return this.namedCache.get(chain) ?? [];
	}
	compileCache() {
		const chains = new Set([""]);
		for (const rule of this.rules) {
			if (!rule.enabled) continue;
			if (rule.alt) for (const alt of rule.alt) chains.add(alt);
		}
		const cache = /* @__PURE__ */ new Map();
		const namedCache = /* @__PURE__ */ new Map();
		for (const chain of chains) {
			const bucket = [];
			const namedBucket = [];
			for (const rule of this.rules) {
				if (!rule.enabled) continue;
				if (chain !== "" && !rule.alt?.includes(chain)) continue;
				bucket.push(rule.fn);
				namedBucket.push({
					name: rule.name,
					fn: rule.fn
				});
			}
			cache.set(chain, bucket);
			namedCache.set(chain, namedBucket);
		}
		this.cache = cache;
		this.namedCache = namedCache;
	}
};
/**
* StateInline - state object for inline parser
*/
var StateInline = class {
	src;
	md;
	env;
	tokens;
	tokens_meta;
	pos;
	posMax;
	level;
	pending;
	pendingLevel;
	cache;
	delimiters;
	_prev_delimiters;
	backticks;
	backticksScanned;
	linkLevel;
	maxNesting;
	constructor(src, md, env, outTokens) {
		this.src = src;
		this.md = md;
		this.env = env;
		this.tokens = outTokens;
		this.tokens_meta = new Array(outTokens.length);
		this.pos = 0;
		this.posMax = src.length;
		this.level = 0;
		this.pending = "";
		this.pendingLevel = 0;
		this.cache = [];
		this.delimiters = [];
		this._prev_delimiters = [];
		this.backticks = {};
		this.backticksScanned = false;
		this.linkLevel = 0;
		this.maxNesting = md.options.maxNesting;
	}
	/**
	* Push pending text as a text token
	*/
	pushPending() {
		const token = new Token("text", "", 0);
		token.content = this.pending;
		token.level = this.pendingLevel;
		this.tokens.push(token);
		this.pending = "";
		return token;
	}
	pushSimple(type, tag) {
		if (this.pending) this.pushPending();
		const token = new Token(type, tag, 0);
		token.level = this.level;
		this.pendingLevel = this.level;
		this.tokens.push(token);
		this.tokens_meta.push(null);
		return token;
	}
	/**
	* Push a new token to the output
	*/
	push(type, tag, nesting) {
		if (this.pending) this.pushPending();
		if (nesting === 0) return this.pushSimple(type, tag);
		const token = new Token(type, tag, nesting);
		let token_meta = null;
		if (nesting < 0) {
			this.level--;
			this.delimiters = this._prev_delimiters.pop();
		}
		token.level = this.level;
		if (nesting > 0) {
			this.level++;
			this._prev_delimiters.push(this.delimiters);
			this.delimiters = [];
			token_meta = { delimiters: this.delimiters };
		}
		this.pendingLevel = this.level;
		this.tokens.push(token);
		this.tokens_meta.push(token_meta);
		return token;
	}
	/**
	* Scan delimiter run (for emphasis)
	*/
	scanDelims(start, canSplitWord) {
		const { src, posMax } = this;
		const marker = src.charCodeAt(start);
		let pos = start;
		while (pos < posMax && src.charCodeAt(pos) === marker) pos++;
		const count = pos - start;
		const lastChar = start > 0 ? src.charCodeAt(start - 1) : 32;
		const nextChar = pos < posMax ? src.charCodeAt(pos) : 32;
		const isLastWhiteSpace = isWhiteSpace(lastChar);
		const isNextWhiteSpace = isWhiteSpace(nextChar);
		const isLastPunctChar = isPunctCode(lastChar);
		const isNextPunctChar = isPunctCode(nextChar);
		const left_flanking = !isNextWhiteSpace && (!isNextPunctChar || isLastWhiteSpace || isLastPunctChar);
		const right_flanking = !isLastWhiteSpace && (!isLastPunctChar || isNextWhiteSpace || isNextPunctChar);
		return {
			can_open: left_flanking && (canSplitWord || !right_flanking || isLastPunctChar),
			can_close: right_flanking && (canSplitWord || !left_flanking || isNextPunctChar),
			length: count
		};
	}
};
StateInline.prototype.Token = Token;
/**
* ParserInline - inline parser with Ruler-based rule management
*/
function isInlineTerminatorChar(ch) {
	switch (ch) {
		case 10:
		case 33:
		case 35:
		case 36:
		case 37:
		case 38:
		case 42:
		case 43:
		case 45:
		case 58:
		case 60:
		case 61:
		case 62:
		case 64:
		case 91:
		case 92:
		case 93:
		case 94:
		case 95:
		case 96:
		case 123:
		case 125:
		case 126: return true;
		default: return false;
	}
}
function isPlainInlineText(src) {
	for (let i = 0; i < src.length; i++) if (isInlineTerminatorChar(src.charCodeAt(i))) return false;
	return true;
}
var ParserInline = class {
	ruler;
	ruler2;
	cachedRulesVersion = -1;
	cachedRules = [];
	cachedRules2Version = -1;
	cachedRules2 = [];
	defaultRulerVersion;
	defaultRuler2Version;
	constructor() {
		this.ruler = new InlineRuler();
		this.ruler2 = new InlineRuler();
		this.ruler.push("text", text_default);
		this.ruler.push("linkify", linkify$1);
		this.ruler.push("newline", newline_default);
		this.ruler.push("escape", escape_default);
		this.ruler.push("backticks", backticks_default);
		this.ruler.push("strikethrough", strikethrough.tokenize);
		this.ruler.push("emphasis", emphasis.tokenize);
		this.ruler.push("link", link_default);
		this.ruler.push("image", image_default);
		this.ruler.push("autolink", autolink_default);
		this.ruler.push("html_inline", html_inline_default);
		this.ruler.push("entity", entity_default);
		this.ruler2.push("balance_pairs", balance_pairs_default);
		this.ruler2.push("strikethrough", strikethrough.postProcess);
		this.ruler2.push("emphasis", emphasis.postProcess);
		this.ruler2.push("fragments_join", fragments_join_default);
		this.defaultRulerVersion = this.ruler.version;
		this.defaultRuler2Version = this.ruler2.version;
	}
	/**
	* Skip single token by running all rules in validation mode
	*/
	skipToken(state) {
		const pos = state.pos;
		const rules = this.getRules();
		const len = rules.length;
		const cache = state.cache;
		const cached = cache[pos];
		const shouldProfile = !!state.env && (Object.prototype.hasOwnProperty.call(state.env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(state.env, "__mdtsProfileRules"));
		if (cached !== void 0) {
			state.pos = cached;
			return;
		}
		let ok = false;
		if (state.level < state.maxNesting) if (!shouldProfile) for (let i = 0; i < len; i++) {
			state.level++;
			ok = rules[i](state, true);
			state.level--;
			if (ok) {
				if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
				break;
			}
		}
		else {
			const namedRules = this.ruler.getNamedRules("");
			for (let i = 0; i < len; i++) {
				state.level++;
				const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				ok = namedRules[i].fn(state, true);
				const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				recordRuleInvocation(state.env, "inline", namedRules[i].name, endedAt - startedAt, !!ok, true);
				state.level--;
				if (ok) {
					if (pos >= state.pos) throw new Error("inline rule didn't increment state.pos");
					break;
				}
			}
		}
		else state.pos = state.posMax;
		if (!ok) state.pos++;
		cache[pos] = state.pos;
	}
	/**
	* Generate tokens for input string
	*/
	tokenize(state) {
		const rules = this.getRules();
		const len = rules.length;
		const end = state.posMax;
		if (!(!!state.env && (Object.prototype.hasOwnProperty.call(state.env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(state.env, "__mdtsProfileRules")))) {
			while (state.pos < end) {
				const prevPos = state.pos;
				let ok = false;
				if (state.level < state.maxNesting) for (let i = 0; i < len; i++) {
					ok = rules[i](state, false);
					if (ok) {
						if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
						break;
					}
				}
				if (ok) {
					if (state.pos >= end) break;
					continue;
				}
				state.pending += state.src.charAt(state.pos++);
			}
			if (state.pending) state.pushPending();
			return;
		}
		const namedRules = this.ruler.getNamedRules("");
		while (state.pos < end) {
			const prevPos = state.pos;
			let ok = false;
			if (state.level < state.maxNesting) for (let i = 0; i < len; i++) {
				const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				ok = namedRules[i].fn(state, false);
				const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				recordRuleInvocation(state.env, "inline", namedRules[i].name, endedAt - startedAt, !!ok, false);
				if (ok) {
					if (prevPos >= state.pos) throw new Error("inline rule didn't increment state.pos");
					break;
				}
			}
			if (ok) {
				if (state.pos >= end) break;
				continue;
			}
			state.pending += state.src.charAt(state.pos++);
		}
		if (state.pending) state.pushPending();
	}
	/**
	* ParserInline.parse(str, md, env, outTokens)
	*
	* Process input string and push inline tokens into `outTokens`.
	* Matches the signature from original markdown-it/lib/parser_inline.mjs
	*/
	isDefaultRuleset() {
		return this.ruler.version === this.defaultRulerVersion && this.ruler2.version === this.defaultRuler2Version;
	}
	parseSource(src, md, env, outTokens) {
		if (typeof src === "string" && src.length > 0 && this.isDefaultRuleset() && isPlainInlineText(src)) {
			const token = new Token("text", "", 0);
			token.content = src;
			outTokens.push(token);
			return;
		}
		const state = new StateInline(src, md, env, outTokens);
		this.tokenize(state);
		const rules2 = this.getRules2();
		const len = rules2.length;
		if (!(!!state.env && (Object.prototype.hasOwnProperty.call(state.env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(state.env, "__mdtsProfileRules")))) {
			for (let i = 0; i < len; i++) rules2[i](state, false);
			return;
		}
		const namedRules2 = this.ruler2.getNamedRules("");
		for (let i = 0; i < len; i++) {
			const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
			namedRules2[i].fn(state, false);
			const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
			recordRuleInvocation(state.env, "inline2", namedRules2[i].name, endedAt - startedAt, true, false);
		}
	}
	parse(str, md, env, outTokens) {
		this.parseSource(str, md, env, outTokens);
	}
	getRules() {
		if (this.cachedRulesVersion !== this.ruler.version) {
			this.cachedRules = this.ruler.getRules("");
			this.cachedRulesVersion = this.ruler.version;
		}
		return this.cachedRules;
	}
	getRules2() {
		if (this.cachedRules2Version !== this.ruler2.version) {
			this.cachedRules2 = this.ruler2.getRules("");
			this.cachedRules2Version = this.ruler2.version;
		}
		return this.cachedRules2;
	}
};
/**
* Core rule: inline
* Iterates through tokens and runs inline parser on 'inline' type tokens.
*/
function inline(state) {
	const tokens = state.tokens;
	const canUsePlainTextFastPath = !!(state.md?.inline)?.isDefaultRuleset?.();
	for (let i = 0, l = tokens.length; i < l; i++) {
		const tok = tokens[i];
		if (tok.type === "inline" && state.md) {
			if (!tok.children) tok.children = [];
			if (canUsePlainTextFastPath && tok.content.length > 0 && isPlainInlineText(tok.content)) {
				const text$1 = new Token("text", "", 0);
				text$1.content = tok.content;
				tok.children.push(text$1);
				continue;
			}
			state.md.inline.parse(tok.content, state.md, state.env, tok.children);
		}
	}
}
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const ASCII_DOMAIN_START_RE = /[0-9a-z]/i;
function isLinkOpen(str) {
	return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
	return /^<\/a\s*>/i.test(str);
}
function trimCjkPrefixFromFuzzyLink(linkify$2, link$1) {
	if (link$1.schema || link$1.index !== 0 || !link$1.raw) return link$1;
	for (let offset = 1; offset < link$1.raw.length; offset++) {
		const prevChar = link$1.raw[offset - 1];
		const nextChar = link$1.raw[offset];
		if (!CJK_CHAR_RE.test(prevChar) || !ASCII_DOMAIN_START_RE.test(nextChar)) continue;
		const suffix = link$1.raw.slice(offset);
		const candidate = linkify$2.match(suffix)?.[0];
		if (!candidate || candidate.index !== 0 || candidate.lastIndex !== suffix.length) continue;
		return {
			...candidate,
			index: link$1.index + offset,
			lastIndex: link$1.index + offset + candidate.lastIndex
		};
	}
	return link$1;
}
function linkify(state) {
	const blockTokens = state.tokens;
	if (!state.md?.options?.linkify) return;
	for (let j = 0; j < blockTokens.length; j++) {
		const blockToken = blockTokens[j];
		if (blockToken.type !== "inline" || !state.md.linkify.pretest(blockToken.content)) continue;
		let tokens = blockToken.children;
		if (!tokens) {
			tokens = [];
			blockToken.children = tokens;
		}
		let htmlLinkLevel = 0;
		for (let i = tokens.length - 1; i >= 0; i--) {
			const currentToken = tokens[i];
			if (currentToken.type === "link_close") {
				i--;
				while (i >= 0 && tokens[i].level !== currentToken.level && tokens[i].type !== "link_open") i--;
				continue;
			}
			if (currentToken.type === "html_inline") {
				if (isLinkOpen(currentToken.content) && htmlLinkLevel > 0) htmlLinkLevel--;
				if (isLinkClose(currentToken.content)) htmlLinkLevel++;
			}
			if (htmlLinkLevel > 0) continue;
			if (currentToken.type !== "text" || !state.md.linkify.test(currentToken.content)) continue;
			const text$1 = currentToken.content;
			let links = (state.md.linkify.match(text$1) || []).map((link$1) => trimCjkPrefixFromFuzzyLink(state.md.linkify, link$1));
			if (links.length === 0) continue;
			const nodes = [];
			let level = currentToken.level;
			let lastPos = 0;
			if (links.length > 0 && links[0].index === 0 && i > 0 && tokens[i - 1].type === "text_special") links = links.slice(1);
			for (let ln = 0; ln < links.length; ln++) {
				const link$1 = links[ln];
				const fullUrl = state.md.normalizeLink(link$1.url);
				if (!state.md.validateLink(fullUrl)) continue;
				let urlText = link$1.text;
				if (!link$1.schema) urlText = state.md.normalizeLinkText(`http://${urlText}`).replace(/^http:\/\//, "");
				else if (link$1.schema === "mailto:" && !/^mailto:/i.test(urlText)) urlText = state.md.normalizeLinkText(`mailto:${urlText}`).replace(/^mailto:/, "");
				else urlText = state.md.normalizeLinkText(urlText);
				const pos = link$1.index;
				if (pos > lastPos) {
					const textToken$1 = new Token("text", "", 0);
					textToken$1.content = text$1.slice(lastPos, pos);
					textToken$1.level = level;
					nodes.push(textToken$1);
				}
				const tokenOpen = new Token("link_open", "a", 1);
				tokenOpen.attrs = [["href", fullUrl]];
				tokenOpen.level = level++;
				tokenOpen.markup = "linkify";
				tokenOpen.info = "auto";
				nodes.push(tokenOpen);
				const tokenText = new Token("text", "", 0);
				tokenText.content = urlText;
				tokenText.level = level;
				nodes.push(tokenText);
				const tokenClose = new Token("link_close", "a", -1);
				tokenClose.level = --level;
				tokenClose.markup = "linkify";
				tokenClose.info = "auto";
				nodes.push(tokenClose);
				lastPos = link$1.lastIndex;
			}
			if (lastPos === 0) continue;
			if (lastPos < text$1.length) {
				const textToken$1 = new Token("text", "", 0);
				textToken$1.content = text$1.slice(lastPos);
				textToken$1.level = level;
				nodes.push(textToken$1);
			}
			tokens.splice(i, 1, ...nodes);
		}
	}
}
const NEWLINES_RE = /\r\n?|\n/g;
const NULL_RE = /\0/g;
function normalize(state) {
	if (!state || typeof state.src !== "string") return;
	const src = state.src;
	const hasCR = src.includes("\r");
	const hasNull = src.includes("\0");
	if (!hasCR && !hasNull) return;
	let str = src;
	if (hasCR) str = str.replace(NEWLINES_RE, "\n");
	if (hasNull) str = str.replace(NULL_RE, "�");
	state.src = str;
}
const RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
const SCOPED_ABBR_TEST_RE = /\((?:c|tm|r)\)/i;
const SCOPED_ABBR_RE = /\((c|tm|r)\)/gi;
const SCOPED_ABBR = {
	c: "©",
	r: "®",
	tm: "™"
};
function replaceFn(_match, name) {
	return SCOPED_ABBR[name.toLowerCase()];
}
function replace_scoped(inlineTokens) {
	let inside_autolink = 0;
	for (let i = inlineTokens.length - 1; i >= 0; i--) {
		const token = inlineTokens[i];
		if (token.type === "text" && !inside_autolink) token.content = token.content.replace(SCOPED_ABBR_RE, replaceFn);
		if (token.type === "link_open" && token.info === "auto") inside_autolink--;
		if (token.type === "link_close" && token.info === "auto") inside_autolink++;
	}
}
function replace_rare(inlineTokens) {
	let inside_autolink = 0;
	for (let i = inlineTokens.length - 1; i >= 0; i--) {
		const token = inlineTokens[i];
		if (token.type === "text" && !inside_autolink) {
			if (RARE_RE.test(token.content)) token.content = token.content.replace(/\+-/g, "±").replace(/\.{2,}/g, "…").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---(?=[^-]|$)/gm, "$1—").replace(/(^|\s)--(?=\s|$)/gm, "$1–").replace(/(^|[^-\s])--(?=[^-\s]|$)/gm, "$1–");
		}
		if (token.type === "link_open" && token.info === "auto") inside_autolink--;
		if (token.type === "link_close" && token.info === "auto") inside_autolink++;
	}
}
function replacements(state) {
	if (!state.md?.options?.typographer) return;
	for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
		const blk = state.tokens[blkIdx];
		if (blk.type !== "inline") continue;
		const blkContent = blk.content || (Array.isArray(blk.children) ? blk.children.map((c) => c.type === "text" ? c.content : "").join("") : "");
		if (SCOPED_ABBR_TEST_RE.test(blkContent)) replace_scoped(blk.children || []);
		if (RARE_RE.test(blkContent)) replace_rare(blk.children || []);
	}
}
var CoreRuler = class {
	rules = [];
	cache = null;
	namedCache = null;
	version = 0;
	invalidateCache() {
		this.cache = null;
		this.namedCache = null;
		this.version++;
	}
	push(name, fn) {
		const idx = this.rules.findIndex((r) => r.name === name);
		if (idx >= 0) this.rules.splice(idx, 1);
		this.rules.push({
			name,
			fn,
			enabled: true
		});
		this.invalidateCache();
	}
	at(name, fn) {
		const idx = this.rules.findIndex((r) => r.name === name);
		if (idx < 0) throw new Error(`Parser rule not found: ${name}`);
		this.rules[idx].fn = fn;
		this.invalidateCache();
	}
	before(beforeName, name, fn) {
		const i = this.rules.findIndex((r) => r.name === beforeName);
		if (i < 0) throw new Error(`Parser rule not found: ${beforeName}`);
		const exists = this.rules.findIndex((r) => r.name === name);
		if (exists >= 0) this.rules.splice(exists, 1);
		this.rules.splice(i, 0, {
			name,
			fn,
			enabled: true
		});
		this.invalidateCache();
	}
	after(afterName, name, fn) {
		const i = this.rules.findIndex((r) => r.name === afterName);
		if (i < 0) throw new Error(`Parser rule not found: ${afterName}`);
		const exists = this.rules.findIndex((r) => r.name === name);
		if (exists >= 0) this.rules.splice(exists, 1);
		this.rules.splice(i + 1, 0, {
			name,
			fn,
			enabled: true
		});
		this.invalidateCache();
	}
	enable(names, ignoreInvalid) {
		const list$1 = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		for (const n of list$1) {
			const idx = this.rules.findIndex((r) => r.name === n);
			if (idx < 0) {
				if (!ignoreInvalid) throw new Error(`Rules manager: invalid rule name ${n}`);
				continue;
			}
			found.push(n);
			if (!this.rules[idx].enabled) {
				this.rules[idx].enabled = true;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
		return found;
	}
	disable(names, ignoreInvalid) {
		const list$1 = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		for (const n of list$1) {
			const idx = this.rules.findIndex((r) => r.name === n);
			if (idx < 0) {
				if (!ignoreInvalid) throw new Error(`Rules manager: invalid rule name ${n}`);
				continue;
			}
			found.push(n);
			if (this.rules[idx].enabled) {
				this.rules[idx].enabled = false;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
		return found;
	}
	enableOnly(names) {
		const set = new Set(names);
		let changed = false;
		for (const r of this.rules) {
			const next = set.has(r.name);
			if (r.enabled !== next) {
				r.enabled = next;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
	}
	compileCache() {
		this.cache = this.rules.filter((r) => r.enabled).map((r) => r.fn);
		this.namedCache = this.rules.filter((r) => r.enabled).map((r) => ({
			name: r.name,
			fn: r.fn
		}));
	}
	getRules(_chainName = "") {
		if (!this.cache) this.compileCache();
		return this.cache;
	}
	getNamedRules(_chainName = "") {
		if (!this.namedCache) this.compileCache();
		return this.namedCache;
	}
};
const QUOTE_TEST_RE = /['"]/;
const QUOTE_RE = /['"]/g;
const APOSTROPHE = "’";
function replaceAt(str, index, ch) {
	return str.slice(0, index) + ch + str.slice(index + 1);
}
function process_inlines(tokens, state) {
	let j;
	const stack = [];
	const quotes = state.md && state.md.options && state.md.options.quotes || "“”‘’";
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		const thisLevel = tokens[i].level;
		for (j = stack.length - 1; j >= 0; j--) if (stack[j].level <= thisLevel) break;
		stack.length = j + 1;
		if (token.type !== "text") continue;
		let text$1 = token.content;
		let pos = 0;
		let max = text$1.length;
		OUTER: while (pos < max) {
			QUOTE_RE.lastIndex = pos;
			const t = QUOTE_RE.exec(text$1);
			if (!t) break;
			let canOpen = true;
			let canClose = true;
			pos = t.index + 1;
			const isSingle = t[0] === "'";
			let lastChar = 32;
			if (t.index - 1 >= 0) lastChar = text$1.charCodeAt(t.index - 1);
			else for (j = i - 1; j >= 0; j--) {
				if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
				if (!tokens[j].content) continue;
				lastChar = tokens[j].content.charCodeAt(tokens[j].content.length - 1);
				break;
			}
			let nextChar = 32;
			if (pos < max) nextChar = text$1.charCodeAt(pos);
			else for (j = i + 1; j < tokens.length; j++) {
				if (tokens[j].type === "softbreak" || tokens[j].type === "hardbreak") break;
				if (!tokens[j].content) continue;
				nextChar = tokens[j].content.charCodeAt(0);
				break;
			}
			const isLastPunctChar = isMdAsciiPunct(lastChar) || isPunctChar(String.fromCharCode(lastChar));
			const isNextPunctChar = isMdAsciiPunct(nextChar) || isPunctChar(String.fromCharCode(nextChar));
			const isLastWhiteSpace = isWhiteSpace(lastChar);
			const isNextWhiteSpace = isWhiteSpace(nextChar);
			if (isNextWhiteSpace) canOpen = false;
			else if (isNextPunctChar) {
				if (!(isLastWhiteSpace || isLastPunctChar)) canOpen = false;
			}
			if (isLastWhiteSpace) canClose = false;
			else if (isLastPunctChar) {
				if (!(isNextWhiteSpace || isNextPunctChar)) canClose = false;
			}
			if (nextChar === 34 && t[0] === "\"") {
				if (lastChar >= 48 && lastChar <= 57) canClose = canOpen = false;
			}
			if (canOpen && canClose) {
				canOpen = isLastPunctChar;
				canClose = isNextPunctChar;
			}
			if (!canOpen && !canClose) {
				if (isSingle) token.content = replaceAt(token.content, t.index, APOSTROPHE);
				continue;
			}
			if (canClose) for (j = stack.length - 1; j >= 0; j--) {
				let item = stack[j];
				if (stack[j].level < thisLevel) break;
				if (item.single === isSingle && stack[j].level === thisLevel) {
					item = stack[j];
					let openQuote;
					let closeQuote;
					if (isSingle) {
						openQuote = quotes[2] || "‘";
						closeQuote = quotes[3] || "’";
					} else {
						openQuote = quotes[0] || "“";
						closeQuote = quotes[1] || "”";
					}
					token.content = replaceAt(token.content, t.index, closeQuote);
					tokens[item.token].content = replaceAt(tokens[item.token].content, item.pos, openQuote);
					pos += closeQuote.length - 1;
					if (item.token === i) pos += openQuote.length - 1;
					text$1 = token.content;
					max = text$1.length;
					stack.length = j;
					continue OUTER;
				}
			}
			if (canOpen) stack.push({
				token: i,
				pos: t.index,
				single: isSingle,
				level: thisLevel
			});
			else if (canClose && isSingle) token.content = replaceAt(token.content, t.index, APOSTROPHE);
		}
	}
}
function smartquotes(state) {
	if (!state.md.options.typographer) return;
	for (let blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
		const inlineToken = state.tokens[blkIdx];
		if (inlineToken.type !== "inline") continue;
		const inlineContent = typeof inlineToken.content === "string" ? inlineToken.content : (inlineToken.children || []).map((t) => t.content || "").join("");
		if (!QUOTE_TEST_RE.test(inlineContent) || !inlineToken.children) continue;
		process_inlines(inlineToken.children, state);
	}
}
function text_join(state) {
	const blockTokens = state.tokens || [];
	const length = blockTokens.length;
	for (let j = 0; j < length; j++) {
		const blockToken = blockTokens[j];
		if (blockToken.type !== "inline" || !Array.isArray(blockToken.children)) continue;
		const tokens = blockToken.children;
		const max = tokens.length;
		for (let curr$1 = 0; curr$1 < max; curr$1++) if (tokens[curr$1].type === "text_special") tokens[curr$1].type = "text";
		let last = 0;
		let curr = 0;
		for (; curr < max; curr++) if (tokens[curr].type === "text" && curr + 1 < max && tokens[curr + 1].type === "text") tokens[curr + 1].content = tokens[curr].content + tokens[curr + 1].content;
		else {
			if (curr !== last) tokens[last] = tokens[curr];
			last++;
		}
		if (curr !== last) tokens.length = last;
	}
}
const BAD_PROTO_RE = /^(?:vbscript|javascript|file|data):/;
const GOOD_DATA_RE = /^data:image\/(?:gif|png|jpeg|webp);/;
const RECODE_HOSTNAME_FOR = [
	"http:",
	"https:",
	"mailto:"
];
/**
* Validate URL to prevent XSS attacks.
* This validator can prohibit more than really needed to prevent XSS.
* It's a tradeoff to keep code simple and to be secure by default.
*/
function validateLink(url) {
	const str = url.trim().toLowerCase();
	return BAD_PROTO_RE.test(str) ? GOOD_DATA_RE.test(str) : true;
}
/**
* Normalize link URL by encoding hostname to ASCII (punycode)
*/
function normalizeLink(url) {
	const parsed = parse_default(url, true);
	if (parsed.hostname) {
		if (!parsed.protocol || RECODE_HOSTNAME_FOR.includes(parsed.protocol)) try {
			parsed.hostname = import_punycode.default.toASCII(parsed.hostname);
		} catch {}
	}
	return encode_default(format(parsed));
}
/**
* Normalize link text by decoding hostname from punycode to Unicode
*/
function normalizeLinkText(url) {
	const parsed = parse_default(url, true);
	if (parsed.hostname) {
		if (!parsed.protocol || RECODE_HOSTNAME_FOR.includes(parsed.protocol)) try {
			parsed.hostname = import_punycode.default.toUnicode(parsed.hostname);
		} catch {}
	}
	return decode_default(format(parsed), `${decode_default.defaultChars}%`);
}
function isSpace$7(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
function blockquote(state, startLine, endLine, silent) {
	const src = state.src;
	const bMarks = state.bMarks;
	const eMarks = state.eMarks;
	const tShift = state.tShift;
	const sCount = state.sCount;
	const bsCount = state.bsCount;
	let pos = bMarks[startLine] + tShift[startLine];
	let max = eMarks[startLine];
	const oldLineMax = state.lineMax;
	if (sCount[startLine] - state.blkIndent >= 4) return false;
	if (src.charCodeAt(pos) !== 62) return false;
	if (silent) return true;
	const oldBMarks = [];
	const oldBSCount = [];
	const oldSCount = [];
	const oldTShift = [];
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "blockquote");
	const oldParentType = state.parentType;
	state.parentType = "blockquote";
	let lastLineEmpty = false;
	let nextLine;
	for (nextLine = startLine; nextLine < endLine; nextLine++) {
		const isOutdented = sCount[nextLine] < state.blkIndent;
		pos = bMarks[nextLine] + tShift[nextLine];
		max = eMarks[nextLine];
		if (pos >= max) break;
		if (src.charCodeAt(pos++) === 62 && !isOutdented) {
			let initial = sCount[nextLine] + 1;
			let spaceAfterMarker;
			let adjustTab;
			if (src.charCodeAt(pos) === 32) {
				pos++;
				initial++;
				adjustTab = false;
				spaceAfterMarker = true;
			} else if (src.charCodeAt(pos) === 9) {
				spaceAfterMarker = true;
				if ((bsCount[nextLine] + initial) % 4 === 3) {
					pos++;
					initial++;
					adjustTab = false;
				} else adjustTab = true;
			} else spaceAfterMarker = false;
			let offset = initial;
			oldBMarks.push(bMarks[nextLine]);
			bMarks[nextLine] = pos;
			while (pos < max) {
				const ch = src.charCodeAt(pos);
				if (isSpace$7(ch)) if (ch === 9) offset += 4 - (offset + bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4;
				else offset++;
				else break;
				pos++;
			}
			lastLineEmpty = pos >= max;
			oldBSCount.push(bsCount[nextLine]);
			bsCount[nextLine] = sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);
			oldSCount.push(sCount[nextLine]);
			sCount[nextLine] = offset - initial;
			oldTShift.push(tShift[nextLine]);
			tShift[nextLine] = pos - bMarks[nextLine];
			continue;
		}
		if (lastLineEmpty) break;
		let terminate = false;
		for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) {
			state.lineMax = nextLine;
			if (state.blkIndent !== 0) {
				oldBMarks.push(bMarks[nextLine]);
				oldBSCount.push(bsCount[nextLine]);
				oldTShift.push(tShift[nextLine]);
				oldSCount.push(sCount[nextLine]);
				sCount[nextLine] -= state.blkIndent;
			}
			break;
		}
		oldBMarks.push(bMarks[nextLine]);
		oldBSCount.push(bsCount[nextLine]);
		oldTShift.push(tShift[nextLine]);
		oldSCount.push(sCount[nextLine]);
		sCount[nextLine] = -1;
	}
	const oldIndent = state.blkIndent;
	state.blkIndent = 0;
	const token_o = state.push("blockquote_open", "blockquote", 1);
	token_o.markup = ">";
	const lines = [startLine, 0];
	token_o.map = lines;
	state.md.block.tokenize(state, startLine, nextLine);
	const token_c = state.push("blockquote_close", "blockquote", -1);
	token_c.markup = ">";
	state.lineMax = oldLineMax;
	state.parentType = oldParentType;
	lines[1] = state.line;
	for (let i = 0; i < oldTShift.length; i++) {
		bMarks[i + startLine] = oldBMarks[i];
		tShift[i + startLine] = oldTShift[i];
		sCount[i + startLine] = oldSCount[i];
		bsCount[i + startLine] = oldBSCount[i];
	}
	state.blkIndent = oldIndent;
	return true;
}
function code(state, startLine, endLine) {
	if (state.sCount[startLine] - state.blkIndent < 4) return false;
	let nextLine = startLine + 1;
	let last = nextLine;
	while (nextLine < endLine) {
		if (state.isEmpty(nextLine)) {
			nextLine++;
			continue;
		}
		if (state.sCount[nextLine] - state.blkIndent >= 4) {
			nextLine++;
			last = nextLine;
			continue;
		}
		break;
	}
	state.line = last;
	const token = state.push("code_block", "code", 0);
	token.content = `${state.getLines(startLine, last, 4 + state.blkIndent, false)}\n`;
	token.map = [startLine, state.line];
	return true;
}
function fence(state, startLine, endLine, silent) {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (pos + 3 > max) return false;
	const marker = state.src.charCodeAt(pos);
	if (marker !== 126 && marker !== 96) return false;
	let mem = pos;
	pos = state.skipChars(pos, marker);
	let len = pos - mem;
	if (len < 3) return false;
	const markup = state.src.slice(mem, pos);
	const params = state.src.slice(pos, max);
	if (marker === 96) {
		if (params.includes(String.fromCharCode(marker))) return false;
	}
	if (silent) return true;
	let nextLine = startLine;
	let haveEndMarker = false;
	for (;;) {
		nextLine++;
		if (nextLine >= endLine) break;
		pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];
		if (pos < max && state.sCount[nextLine] < state.blkIndent) break;
		if (state.src.charCodeAt(pos) !== marker) continue;
		if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
		pos = state.skipChars(pos, marker);
		if (pos - mem < len) continue;
		pos = state.skipSpaces(pos);
		if (pos < max) continue;
		haveEndMarker = true;
		break;
	}
	len = state.sCount[startLine];
	state.line = nextLine + (haveEndMarker ? 1 : 0);
	const token = state.push("fence", "code", 0);
	token.info = params;
	token.content = state.getLines(startLine + 1, nextLine, len, true);
	token.markup = markup;
	token.map = [startLine, state.line];
	return true;
}
const HEADING_TAGS$1 = [
	"",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6"
];
const HEADING_MARKUP = [
	"",
	"#",
	"##",
	"###",
	"####",
	"#####",
	"######"
];
function isSpace$6(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
function heading(state, startLine, endLine, silent) {
	const src = state.src;
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const eMarks = state.eMarks;
	let pos = bMarks[startLine] + tShift[startLine];
	let max = eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	let ch = src.charCodeAt(pos);
	if (ch !== 35 || pos >= max) return false;
	let level = 1;
	ch = src.charCodeAt(++pos);
	while (ch === 35 && pos < max && level <= 6) {
		level++;
		ch = src.charCodeAt(++pos);
	}
	if (level > 6 || pos < max && !isSpace$6(ch)) return false;
	if (silent) return true;
	max = state.skipSpacesBack(max, pos);
	const tmp = state.skipCharsBack(max, 35, pos);
	if (tmp > pos && isSpace$6(src.charCodeAt(tmp - 1))) max = tmp;
	state.line = startLine + 1;
	const token_o = state.push("heading_open", HEADING_TAGS$1[level], 1);
	token_o.markup = HEADING_MARKUP[level];
	token_o.map = [startLine, state.line];
	const token_i = state.push("inline", "", 0);
	token_i.content = src.slice(pos, max).trim();
	token_i.map = [startLine, state.line];
	token_i.children = [];
	const token_c = state.push("heading_close", HEADING_TAGS$1[level], -1);
	token_c.markup = HEADING_MARKUP[level];
	return true;
}
function isSpace$5(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
function hr(state, startLine, endLine, silent) {
	const max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	const marker = state.src.charCodeAt(pos++);
	if (marker !== 42 && marker !== 45 && marker !== 95) return false;
	let cnt = 1;
	while (pos < max) {
		const ch = state.src.charCodeAt(pos++);
		if (ch !== marker && !isSpace$5(ch)) return false;
		if (ch === marker) cnt++;
	}
	if (cnt < 3) return false;
	if (silent) return true;
	state.line = startLine + 1;
	const token = state.push("hr", "hr", 0);
	token.map = [startLine, state.line];
	token.markup = new Array(cnt + 1).join(String.fromCharCode(marker));
	return true;
}
const HTML_SEQUENCES = [
	[
		/^<(script|pre|style|textarea)(?=(\s|>|$))/i,
		/<\/(script|pre|style|textarea)>/i,
		true
	],
	[
		/^<!--/,
		/-->/,
		true
	],
	[
		/^<\?/,
		/\?>/,
		true
	],
	[
		/^<![A-Z]/,
		/>/,
		true
	],
	[
		/^<!\[CDATA\[/,
		/\]\]>/,
		true
	],
	[
		new RegExp(`^</?(${[
			"address",
			"article",
			"aside",
			"base",
			"basefont",
			"blockquote",
			"body",
			"caption",
			"center",
			"col",
			"colgroup",
			"dd",
			"details",
			"dialog",
			"dir",
			"div",
			"dl",
			"dt",
			"fieldset",
			"figcaption",
			"figure",
			"footer",
			"form",
			"frame",
			"frameset",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"head",
			"header",
			"hr",
			"html",
			"iframe",
			"legend",
			"li",
			"link",
			"main",
			"menu",
			"menuitem",
			"nav",
			"noframes",
			"ol",
			"optgroup",
			"option",
			"p",
			"param",
			"search",
			"section",
			"summary",
			"table",
			"tbody",
			"td",
			"tfoot",
			"th",
			"thead",
			"title",
			"tr",
			"track",
			"ul"
		].join("|")})(?=(\\s|/?>|$))`, "i"),
		/^$/,
		true
	],
	[
		/* @__PURE__ */ new RegExp(`${HTML_OPEN_CLOSE_TAG_RE.source}\\s*$`),
		/^$/,
		false
	]
];
function html_block(state, startLine, endLine, silent) {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (!state.md.options.html) return false;
	if (state.src.charCodeAt(pos) !== 60) return false;
	let lineText = state.src.slice(pos, max);
	let i = 0;
	for (; i < HTML_SEQUENCES.length; i++) if (HTML_SEQUENCES[i][0].test(lineText)) break;
	if (i === HTML_SEQUENCES.length) return false;
	if (silent) return HTML_SEQUENCES[i][2];
	let nextLine = startLine + 1;
	if (!HTML_SEQUENCES[i][1].test(lineText)) for (; nextLine < endLine; nextLine++) {
		if (state.sCount[nextLine] < state.blkIndent) break;
		pos = state.bMarks[nextLine] + state.tShift[nextLine];
		max = state.eMarks[nextLine];
		lineText = state.src.slice(pos, max);
		if (HTML_SEQUENCES[i][1].test(lineText)) {
			if (lineText.length !== 0) nextLine++;
			break;
		}
	}
	state.line = nextLine;
	const token = state.push("html_block", "", 0);
	token.map = [startLine, nextLine];
	token.content = state.getLines(startLine, nextLine, state.blkIndent, true);
	return true;
}
function hasPipeOnLine(src, start, max) {
	for (let pos = start; pos < max; pos++) if (src.charCodeAt(pos) === 124) return true;
	return false;
}
function canUseParagraphTerminatorFastPath(state) {
	const ruler = state?.md?.block?.ruler;
	if (!ruler) return false;
	return ruler.version === ruler.__mdtsDefaultVersion;
}
function couldTerminateParagraph(src, start, max) {
	if (start >= max) return false;
	const marker = src.charCodeAt(start);
	switch (marker) {
		case 35:
		case 42:
		case 43:
		case 45:
		case 60:
		case 62:
		case 95:
		case 96:
		case 126: return true;
	}
	if (marker >= 48 && marker <= 57) return true;
	return hasPipeOnLine(src, start, max);
}
const HEADING_TAGS = [
	"",
	"h1",
	"h2"
];
function lheading(state, startLine, endLine) {
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "paragraph");
	const src = state.src;
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const eMarks = state.eMarks;
	const sCount = state.sCount;
	const blkIndent = state.blkIndent;
	const canUseFastTerminatorHint = canUseParagraphTerminatorFastPath(state);
	if (sCount[startLine] - blkIndent >= 4) return false;
	const oldParentType = state.parentType;
	state.parentType = "paragraph";
	let level = 0;
	let marker;
	let nextLine = startLine + 1;
	for (; nextLine < endLine; nextLine++) {
		const lineStart = bMarks[nextLine] + tShift[nextLine];
		const max = eMarks[nextLine];
		if (lineStart >= max) break;
		if (sCount[nextLine] - blkIndent > 3) continue;
		if (sCount[nextLine] >= blkIndent) {
			marker = src.charCodeAt(lineStart);
			if (marker === 45 || marker === 61) {
				let pos = lineStart + 1;
				let markerEnd = pos;
				while (pos < max && src.charCodeAt(pos) === marker) pos++;
				markerEnd = pos;
				while (pos < max) {
					const ch = src.charCodeAt(pos);
					if (ch !== 9 && ch !== 32) break;
					pos++;
				}
				if (pos >= max) {
					level = marker === 61 ? 1 : 2;
					break;
				}
				if (markerEnd - lineStart > 1) continue;
			}
		}
		if (sCount[nextLine] < 0) continue;
		if (canUseFastTerminatorHint && !couldTerminateParagraph(src, lineStart, max)) continue;
		let terminate = false;
		for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) break;
	}
	if (!level) return false;
	let content;
	if (nextLine === startLine + 1) {
		const lineStart = bMarks[startLine] + tShift[startLine];
		let lineEnd = eMarks[startLine];
		while (lineEnd > lineStart) {
			const ch = src.charCodeAt(lineEnd - 1);
			if (ch !== 9 && ch !== 32) break;
			lineEnd--;
		}
		content = src.slice(lineStart, lineEnd);
	} else content = state.getLines(startLine, nextLine, blkIndent, false).trim();
	state.line = nextLine + 1;
	const markup = marker === 61 ? "=" : "-";
	const token_o = state.push("heading_open", HEADING_TAGS[level], 1);
	token_o.markup = markup;
	token_o.map = [startLine, state.line];
	const token_i = state.push("inline", "", 0);
	token_i.content = content;
	token_i.map = [startLine, state.line - 1];
	token_i.children = [];
	const token_c = state.push("heading_close", HEADING_TAGS[level], -1);
	token_c.markup = markup;
	state.parentType = oldParentType;
	return true;
}
function isSpace$4(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
function skipBulletListMarker(state, startLine) {
	const eMarks = state.eMarks;
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const src = state.src;
	const max = eMarks[startLine];
	let pos = bMarks[startLine] + tShift[startLine];
	const marker = src.charCodeAt(pos++);
	if (marker !== 42 && marker !== 45 && marker !== 43) return -1;
	if (pos < max) {
		if (!isSpace$4(src.charCodeAt(pos))) return -1;
	}
	return pos;
}
function skipOrderedListMarker(state, startLine) {
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const eMarks = state.eMarks;
	const src = state.src;
	const start = bMarks[startLine] + tShift[startLine];
	const max = eMarks[startLine];
	let pos = start;
	if (pos + 1 >= max) return -1;
	let ch = src.charCodeAt(pos++);
	if (ch < 48 || ch > 57) return -1;
	for (;;) {
		if (pos >= max) return -1;
		ch = src.charCodeAt(pos++);
		if (ch >= 48 && ch <= 57) {
			if (pos - start >= 10) return -1;
			continue;
		}
		if (ch === 41 || ch === 46) break;
		return -1;
	}
	if (pos < max) {
		ch = src.charCodeAt(pos);
		if (!isSpace$4(ch)) return -1;
	}
	return pos;
}
function parseOrderedListMarkerValue(state, startLine, markerEnd) {
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const src = state.src;
	const start = bMarks[startLine] + tShift[startLine];
	let value = 0;
	for (let pos = start; pos < markerEnd - 1; pos++) value = value * 10 + src.charCodeAt(pos) - 48;
	return value;
}
const SINGLE_DIGIT_MARKERS = [
	"0",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
	"7",
	"8",
	"9"
];
function markTightParagraphs(state, idx) {
	const level = state.level + 2;
	const tokens = state.tokens;
	for (let i = idx + 2, l = tokens.length - 2; i < l; i++) {
		const token = tokens[i];
		if (token.level !== level) continue;
		if (token.type === "paragraph_open") {
			token.hidden = true;
			tokens[i + 2].hidden = true;
			i += 2;
			continue;
		}
		if (token.nesting === 1) {
			let nesting = 1;
			while (nesting > 0 && ++i < l) nesting += tokens[i].nesting;
		}
	}
}
function list(state, startLine, endLine, silent) {
	let max;
	let pos;
	let start = 0;
	let nextLine = startLine;
	let tight = true;
	if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
	if (state.listIndent >= 0 && state.sCount[nextLine] - state.listIndent >= 4 && state.sCount[nextLine] < state.blkIndent) return false;
	let isTerminatingParagraph = false;
	if (silent && state.parentType === "paragraph") {
		if (state.sCount[nextLine] >= state.blkIndent) isTerminatingParagraph = true;
	}
	let isOrdered;
	let markerValue;
	let posAfterMarker;
	const src = state.src;
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const eMarks = state.eMarks;
	const sCount = state.sCount;
	const bsCount = state.bsCount;
	const lineStart = bMarks[nextLine] + tShift[nextLine];
	if (lineStart >= eMarks[nextLine]) return false;
	const marker = src.charCodeAt(lineStart);
	if (marker >= 48 && marker <= 57) {
		posAfterMarker = skipOrderedListMarker(state, nextLine);
		if (posAfterMarker < 0) return false;
		isOrdered = true;
		start = lineStart;
		markerValue = parseOrderedListMarkerValue(state, nextLine, posAfterMarker);
		if (isTerminatingParagraph && markerValue !== 1) return false;
	} else if (marker === 42 || marker === 45 || marker === 43) {
		posAfterMarker = skipBulletListMarker(state, nextLine);
		if (posAfterMarker < 0) return false;
		isOrdered = false;
	} else return false;
	if (isTerminatingParagraph) {
		if (state.skipSpaces(posAfterMarker) >= eMarks[nextLine]) return false;
	}
	if (silent) return true;
	const markerCharCode = src.charCodeAt(posAfterMarker - 1);
	const markerMarkup = String.fromCharCode(markerCharCode);
	if (isOrdered) {
		const token = state.push("ordered_list_open", "ol", 1);
		if (markerValue !== void 0 && markerValue !== 1) token.attrs = [["start", String(markerValue)]];
	} else state.push("bullet_list_open", "ul", 1);
	const listLines = [nextLine, 0];
	state.tokens[state.tokens.length - 1].map = listLines;
	state.tokens[state.tokens.length - 1].markup = markerMarkup;
	let prevEmptyEnd = false;
	const listTokIdx = state.tokens.length - 1;
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "list");
	const oldParentType = state.parentType;
	state.parentType = "list";
	while (nextLine < endLine) {
		pos = posAfterMarker;
		max = eMarks[nextLine];
		const initial = sCount[nextLine] + posAfterMarker - (bMarks[nextLine] + tShift[nextLine]);
		let offset = initial;
		while (pos < max) {
			const ch = src.charCodeAt(pos);
			if (ch === 9) offset += 4 - (offset + bsCount[nextLine]) % 4;
			else if (ch === 32) offset++;
			else break;
			pos++;
		}
		const contentStart = pos;
		let indentAfterMarker;
		if (contentStart >= max) indentAfterMarker = 1;
		else indentAfterMarker = offset - initial;
		if (indentAfterMarker > 4) indentAfterMarker = 1;
		const indent = initial + indentAfterMarker;
		const token = state.push("list_item_open", "li", 1);
		token.markup = markerMarkup;
		const itemLines = [nextLine, 0];
		token.map = itemLines;
		if (isOrdered) token.info = posAfterMarker - start - 1 === 1 ? SINGLE_DIGIT_MARKERS[src.charCodeAt(start) - 48] : src.slice(start, posAfterMarker - 1);
		const oldTight = state.tight;
		const oldTShift = state.tShift[nextLine];
		const oldSCount = state.sCount[nextLine];
		const oldListIndent = state.listIndent;
		state.listIndent = state.blkIndent;
		state.blkIndent = indent;
		state.tight = true;
		state.tShift[nextLine] = contentStart - bMarks[nextLine];
		state.sCount[nextLine] = offset;
		if (contentStart >= max && state.isEmpty(nextLine + 1)) state.line = Math.min(state.line + 2, endLine);
		else state.md.block.tokenize(state, nextLine, endLine, true);
		if (!state.tight || prevEmptyEnd) tight = false;
		prevEmptyEnd = state.line - nextLine > 1 && state.isEmpty(state.line - 1);
		state.blkIndent = state.listIndent;
		state.listIndent = oldListIndent;
		state.tShift[nextLine] = oldTShift;
		state.sCount[nextLine] = oldSCount;
		state.tight = oldTight;
		state.push("list_item_close", "li", -1).markup = markerMarkup;
		nextLine = state.line;
		itemLines[1] = nextLine;
		if (nextLine >= endLine) break;
		if (state.sCount[nextLine] < state.blkIndent) break;
		if (state.sCount[nextLine] - state.blkIndent >= 4) break;
		let terminate = false;
		for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) break;
		if (isOrdered) {
			posAfterMarker = skipOrderedListMarker(state, nextLine);
			if (posAfterMarker < 0) break;
			start = bMarks[nextLine] + tShift[nextLine];
		} else {
			posAfterMarker = skipBulletListMarker(state, nextLine);
			if (posAfterMarker < 0) break;
		}
		if (markerCharCode !== src.charCodeAt(posAfterMarker - 1)) break;
	}
	if (isOrdered) state.push("ordered_list_close", "ol", -1).markup = markerMarkup;
	else state.push("bullet_list_close", "ul", -1).markup = markerMarkup;
	listLines[1] = nextLine;
	state.line = nextLine;
	state.parentType = oldParentType;
	if (tight) markTightParagraphs(state, listTokIdx);
	return true;
}
function isSpace$3(code$1) {
	return code$1 === 9 || code$1 === 32;
}
function paragraph(state, startLine, endLine) {
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "paragraph");
	const oldParentType = state.parentType;
	const src = state.src;
	const bMarks = state.bMarks;
	const tShift = state.tShift;
	const eMarks = state.eMarks;
	const sCount = state.sCount;
	const blkIndent = state.blkIndent;
	const canUseFastTerminatorHint = canUseParagraphTerminatorFastPath(state);
	let nextLine = startLine + 1;
	state.parentType = "paragraph";
	for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
		if (sCount[nextLine] - blkIndent > 3) continue;
		if (sCount[nextLine] < 0) continue;
		if (oldParentType === "list" && sCount[nextLine] >= blkIndent) {
			const start$1 = bMarks[nextLine] + tShift[nextLine];
			const max$1 = eMarks[nextLine];
			if (start$1 < max$1) {
				const marker = src.charCodeAt(start$1);
				if (marker === 42 || marker === 45 || marker === 43) {
					if (start$1 + 1 >= max$1 || isSpace$3(src.charCodeAt(start$1 + 1))) break;
				} else if (marker >= 48 && marker <= 57 && start$1 + 1 < max$1) {
					let pos = start$1 + 1;
					for (;;) {
						if (pos >= max$1) {
							pos = -1;
							break;
						}
						const ch = src.charCodeAt(pos++);
						if (ch >= 48 && ch <= 57) {
							if (pos - start$1 >= 10) {
								pos = -1;
								break;
							}
							continue;
						}
						if ((ch === 41 || ch === 46) && (pos >= max$1 || isSpace$3(src.charCodeAt(pos)))) break;
						pos = -1;
						break;
					}
					if (pos >= 0) break;
				}
			}
		}
		const start = bMarks[nextLine] + tShift[nextLine];
		const max = eMarks[nextLine];
		if (canUseFastTerminatorHint && !couldTerminateParagraph(src, start, max)) continue;
		let terminate = false;
		for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) break;
	}
	const content = state.getLines(startLine, nextLine, blkIndent, false).trim();
	state.line = nextLine;
	const token_o = state.push("paragraph_open", "p", 1);
	token_o.map = [startLine, state.line];
	const token_i = state.push("inline", "", 0);
	token_i.content = content;
	token_i.map = [startLine, state.line];
	token_i.children = [];
	state.push("paragraph_close", "p", -1);
	state.parentType = oldParentType;
	return true;
}
function isSpace$2(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
function reference(state, startLine, _endLine, silent) {
	let pos = state.bMarks[startLine] + state.tShift[startLine];
	let max = state.eMarks[startLine];
	let nextLine = startLine + 1;
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "reference");
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	if (state.src.charCodeAt(pos) !== 91) return false;
	function getNextLine(nextLine$1) {
		const endLine = state.lineMax;
		if (nextLine$1 >= endLine || state.isEmpty(nextLine$1)) return null;
		let isContinuation = false;
		if (state.sCount[nextLine$1] - state.blkIndent > 3) isContinuation = true;
		if (state.sCount[nextLine$1] < 0) isContinuation = true;
		if (!isContinuation) {
			const oldParentType = state.parentType;
			state.parentType = "reference";
			let terminate = false;
			for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine$1, endLine, true)) {
				terminate = true;
				break;
			}
			state.parentType = oldParentType;
			if (terminate) return null;
		}
		const pos$1 = state.bMarks[nextLine$1] + state.tShift[nextLine$1];
		const max$1 = state.eMarks[nextLine$1];
		return state.src.slice(pos$1, max$1 + 1);
	}
	let str = state.src.slice(pos, max + 1);
	max = str.length;
	let labelEnd = -1;
	for (pos = 1; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 91) return false;
		else if (ch === 93) {
			labelEnd = pos;
			break;
		} else if (ch === 10) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (ch === 92) {
			pos++;
			if (pos < max && str.charCodeAt(pos) === 10) {
				const lineContent = getNextLine(nextLine);
				if (lineContent !== null) {
					str += lineContent;
					max = str.length;
					nextLine++;
				}
			}
		}
	}
	if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) return false;
	for (pos = labelEnd + 2; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 10) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (isSpace$2(ch)) {} else break;
	}
	const destRes = state.md.helpers.parseLinkDestination(str, pos, max);
	if (!destRes.ok) return false;
	const href = state.md.normalizeLink(destRes.str);
	if (!state.md.validateLink(href)) return false;
	pos = destRes.pos;
	const destEndPos = pos;
	const destEndLineNo = nextLine;
	const start = pos;
	for (; pos < max; pos++) {
		const ch = str.charCodeAt(pos);
		if (ch === 10) {
			const lineContent = getNextLine(nextLine);
			if (lineContent !== null) {
				str += lineContent;
				max = str.length;
				nextLine++;
			}
		} else if (isSpace$2(ch)) {} else break;
	}
	let titleRes = state.md.helpers.parseLinkTitle(str, pos, max);
	while (titleRes.can_continue) {
		const lineContent = getNextLine(nextLine);
		if (lineContent === null) break;
		str += lineContent;
		pos = max;
		max = str.length;
		nextLine++;
		titleRes = state.md.helpers.parseLinkTitle(str, pos, max, titleRes);
	}
	let title;
	if (pos < max && start !== pos && titleRes.ok) {
		title = titleRes.str;
		pos = titleRes.pos;
	} else {
		title = "";
		pos = destEndPos;
		nextLine = destEndLineNo;
	}
	while (pos < max) {
		if (!isSpace$2(str.charCodeAt(pos))) break;
		pos++;
	}
	if (pos < max && str.charCodeAt(pos) !== 10) {
		if (title) {
			title = "";
			pos = destEndPos;
			nextLine = destEndLineNo;
			while (pos < max) {
				if (!isSpace$2(str.charCodeAt(pos))) break;
				pos++;
			}
		}
	}
	if (pos < max && str.charCodeAt(pos) !== 10) return false;
	const label = normalizeReference(str.slice(1, labelEnd));
	if (!label) return false;
	if (silent) return true;
	if (typeof state.env.references === "undefined") state.env.references = {};
	if (typeof state.env.references[label] === "undefined") state.env.references[label] = {
		title,
		href
	};
	state.line = nextLine;
	return true;
}
function isSpace$1(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
const MAX_AUTOCOMPLETED_CELLS = 65536;
function getLine(state, line) {
	const pos = state.bMarks[line] + state.tShift[line];
	const max = state.eMarks[line];
	return state.src.slice(pos, max);
}
function lineContainsPipe(state, line) {
	for (let pos = state.bMarks[line] + state.tShift[line], max = state.eMarks[line]; pos < max; pos++) if (state.src.charCodeAt(pos) === 124) return true;
	return false;
}
function escapedSplit(str) {
	const result = [];
	const max = str.length;
	let pos = 0;
	let ch = str.charCodeAt(pos);
	let isEscaped = false;
	let lastPos = 0;
	let current = "";
	while (pos < max) {
		if (ch === 124) if (!isEscaped) {
			result.push(current + str.substring(lastPos, pos));
			current = "";
			lastPos = pos + 1;
		} else {
			current += str.substring(lastPos, pos - 1);
			lastPos = pos;
		}
		isEscaped = ch === 92;
		pos++;
		ch = str.charCodeAt(pos);
	}
	result.push(current + str.substring(lastPos));
	return result;
}
function table(state, startLine, endLine, silent) {
	if (startLine + 2 > endLine) return false;
	let nextLine = startLine + 1;
	if (state.sCount[nextLine] < state.blkIndent) return false;
	if (state.sCount[nextLine] - state.blkIndent >= 4) return false;
	let pos = state.bMarks[nextLine] + state.tShift[nextLine];
	if (pos >= state.eMarks[nextLine]) return false;
	const firstCh = state.src.charCodeAt(pos++);
	if (firstCh !== 124 && firstCh !== 45 && firstCh !== 58) return false;
	if (pos >= state.eMarks[nextLine]) return false;
	const secondCh = state.src.charCodeAt(pos++);
	if (secondCh !== 124 && secondCh !== 45 && secondCh !== 58 && !isSpace$1(secondCh)) return false;
	if (firstCh === 45 && isSpace$1(secondCh)) return false;
	if (!lineContainsPipe(state, startLine)) return false;
	while (pos < state.eMarks[nextLine]) {
		const ch = state.src.charCodeAt(pos);
		if (ch !== 124 && ch !== 45 && ch !== 58 && !isSpace$1(ch)) return false;
		pos++;
	}
	let lineText = getLine(state, startLine + 1);
	let columns = lineText.split("|");
	const aligns = [];
	for (let i = 0; i < columns.length; i++) {
		const t = columns[i].trim();
		if (!t) if (i === 0 || i === columns.length - 1) continue;
		else return false;
		if (!/^:?-+:?$/.test(t)) return false;
		if (t.charCodeAt(t.length - 1) === 58) aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
		else if (t.charCodeAt(0) === 58) aligns.push("left");
		else aligns.push("");
	}
	lineText = getLine(state, startLine).trim();
	if (state.sCount[startLine] - state.blkIndent >= 4) return false;
	columns = escapedSplit(lineText);
	if (columns.length && columns[0] === "") columns.shift();
	if (columns.length && columns[columns.length - 1] === "") columns.pop();
	const columnCount = columns.length;
	if (columnCount === 0 || columnCount !== aligns.length) return false;
	if (silent) return true;
	const oldParentType = state.parentType;
	state.parentType = "table";
	const terminatorRules = state.md.block.ruler.getRulesForState(state, "blockquote");
	const token_to = state.push("table_open", "table", 1);
	const tableLines = [startLine, 0];
	token_to.map = tableLines;
	const token_tho = state.push("thead_open", "thead", 1);
	token_tho.map = [startLine, startLine + 1];
	const token_htro = state.push("tr_open", "tr", 1);
	token_htro.map = [startLine, startLine + 1];
	for (let i = 0; i < columns.length; i++) {
		const token_ho = state.push("th_open", "th", 1);
		if (aligns[i]) token_ho.attrs = [["style", `text-align:${aligns[i]}`]];
		const token_il = state.push("inline", "", 0);
		token_il.content = columns[i].trim();
		token_il.children = [];
		state.push("th_close", "th", -1);
	}
	state.push("tr_close", "tr", -1);
	state.push("thead_close", "thead", -1);
	let tbodyLines;
	let autocompletedCells = 0;
	for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
		if (state.sCount[nextLine] < state.blkIndent) break;
		let terminate = false;
		for (let i = 0, l = terminatorRules.length; i < l; i++) if (terminatorRules[i](state, nextLine, endLine, true)) {
			terminate = true;
			break;
		}
		if (terminate) break;
		lineText = getLine(state, nextLine).trim();
		if (!lineText) break;
		if (state.sCount[nextLine] - state.blkIndent >= 4) break;
		columns = escapedSplit(lineText);
		if (columns.length && columns[0] === "") columns.shift();
		if (columns.length && columns[columns.length - 1] === "") columns.pop();
		autocompletedCells += columnCount - columns.length;
		if (autocompletedCells > MAX_AUTOCOMPLETED_CELLS) break;
		if (nextLine === startLine + 2) {
			const token_tbo = state.push("tbody_open", "tbody", 1);
			token_tbo.map = tbodyLines = [startLine + 2, 0];
		}
		const token_tro = state.push("tr_open", "tr", 1);
		token_tro.map = [nextLine, nextLine + 1];
		for (let i = 0; i < columnCount; i++) {
			const token_tdo = state.push("td_open", "td", 1);
			if (aligns[i]) token_tdo.attrs = [["style", `text-align:${aligns[i]}`]];
			const token_il = state.push("inline", "", 0);
			token_il.content = columns[i] ? columns[i].trim() : "";
			token_il.children = [];
			state.push("td_close", "td", -1);
		}
		state.push("tr_close", "tr", -1);
	}
	if (tbodyLines) {
		state.push("tbody_close", "tbody", -1);
		tbodyLines[1] = nextLine;
	}
	state.push("table_close", "table", -1);
	tableLines[1] = nextLine;
	state.parentType = oldParentType;
	state.line = nextLine;
	return true;
}
var BlockRuler = class {
	_rules = [];
	cache = null;
	namedCache = null;
	version = 0;
	invalidateCache() {
		this.cache = null;
		this.namedCache = null;
		this.version++;
	}
	push(name, fn, options) {
		this._rules.push({
			name,
			enabled: true,
			fn,
			alt: options?.alt || []
		});
		this.invalidateCache();
	}
	before(beforeName, name, fn, options) {
		const i = this._rules.findIndex((r) => r.name === beforeName);
		if (i < 0) throw new Error(`Parser rule not found: ${beforeName}`);
		const exists = this._rules.findIndex((r) => r.name === name);
		if (exists >= 0) this._rules.splice(exists, 1);
		this._rules.splice(i, 0, {
			name,
			enabled: true,
			fn,
			alt: options?.alt || []
		});
		this.invalidateCache();
	}
	after(afterName, name, fn, options) {
		const i = this._rules.findIndex((r) => r.name === afterName);
		if (i < 0) throw new Error(`Parser rule not found: ${afterName}`);
		const exists = this._rules.findIndex((r) => r.name === name);
		if (exists >= 0) this._rules.splice(exists, 1);
		this._rules.splice(i + 1, 0, {
			name,
			enabled: true,
			fn,
			alt: options?.alt || []
		});
		this.invalidateCache();
	}
	getRules(chainName) {
		const chain = chainName || "";
		if (!this.cache) this.compileCache();
		return this.cache[chain] ?? [];
	}
	getNamedRules(chainName) {
		const chain = chainName || "";
		if (!this.namedCache) this.compileCache();
		return this.namedCache[chain] ?? [];
	}
	getRulesForState(state, chainName) {
		const env = state?.env;
		if (!(!!env && (Object.prototype.hasOwnProperty.call(env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(env, "__mdtsProfileRules")))) return this.getRules(chainName);
		return this.getNamedRules(chainName).map(({ name, fn }) => {
			return (currentState, startLine, endLine, silent) => {
				const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				const ok = fn(currentState, startLine, endLine, silent);
				const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				recordRuleInvocation(currentState?.env, "block", name, endedAt - startedAt, ok, !!silent);
				return ok;
			};
		});
	}
	at(name, fn, options) {
		const index = this._rules.findIndex((r) => r.name === name);
		if (index === -1) throw new Error(`Parser rule not found: ${name}`);
		this._rules[index].fn = fn;
		if (options?.alt) this._rules[index].alt = options.alt;
		this.invalidateCache();
	}
	enable(names, ignoreInvalid) {
		const nameList = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		nameList.forEach((name) => {
			const idx = this._rules.findIndex((r) => r.name === name);
			if (idx === -1) {
				if (ignoreInvalid) return;
				throw new Error(`Rules manager: invalid rule name ${name}`);
			}
			found.push(name);
			if (!this._rules[idx].enabled) {
				this._rules[idx].enabled = true;
				changed = true;
			}
		});
		if (changed) this.invalidateCache();
		return found;
	}
	disable(names, ignoreInvalid) {
		const nameList = Array.isArray(names) ? names : [names];
		const found = [];
		let changed = false;
		nameList.forEach((name) => {
			const idx = this._rules.findIndex((r) => r.name === name);
			if (idx === -1) {
				if (ignoreInvalid) return;
				throw new Error(`Rules manager: invalid rule name ${name}`);
			}
			found.push(name);
			if (this._rules[idx].enabled) {
				this._rules[idx].enabled = false;
				changed = true;
			}
		});
		if (changed) this.invalidateCache();
		return found;
	}
	enableOnly(names) {
		const allow = new Set(names);
		let changed = false;
		for (const r of this._rules) {
			const next = allow.has(r.name);
			if (r.enabled !== next) {
				r.enabled = next;
				changed = true;
			}
		}
		if (changed) this.invalidateCache();
	}
	compileCache() {
		const chains = new Set([""]);
		for (const rule of this._rules) {
			if (!rule.enabled) continue;
			for (const alt of rule.alt) chains.add(alt);
		}
		const cache = Object.create(null);
		const namedCache = Object.create(null);
		for (const chain of chains) {
			const bucket = [];
			const namedBucket = [];
			for (const rule of this._rules) {
				if (!rule.enabled) continue;
				if (chain !== "" && !rule.alt.includes(chain)) continue;
				bucket.push(rule.fn);
				namedBucket.push({
					name: rule.name,
					fn: rule.fn
				});
			}
			cache[chain] = bucket;
			namedCache[chain] = namedBucket;
		}
		this.cache = cache;
		this.namedCache = namedCache;
	}
};
function isSpace(code$1) {
	switch (code$1) {
		case 9:
		case 32: return true;
	}
	return false;
}
var StateBlock = class {
	src;
	md;
	env;
	tokens;
	bMarks = [];
	eMarks = [];
	tShift = [];
	sCount = [];
	bsCount = [];
	blkIndent = 0;
	line = 0;
	lineMax = 0;
	tight = false;
	ddIndent = -1;
	listIndent = -1;
	parentType = "root";
	level = 0;
	constructor(src, md, env, tokens) {
		this.src = src;
		this.md = md;
		this.env = env;
		this.tokens = tokens;
		const s = this.src;
		let indent = 0;
		let offset = 0;
		let start = 0;
		let indent_found = false;
		for (let pos = 0, len = s.length; pos < len; pos++) {
			const ch = s.charCodeAt(pos);
			if (!indent_found) if (isSpace(ch)) {
				indent++;
				if (ch === 9) offset += 4 - offset % 4;
				else offset++;
				continue;
			} else indent_found = true;
			if (ch === 10 || pos === len - 1) {
				if (ch !== 10) pos++;
				this.bMarks.push(start);
				this.eMarks.push(pos);
				this.tShift.push(indent);
				this.sCount.push(offset);
				this.bsCount.push(0);
				indent_found = false;
				indent = 0;
				offset = 0;
				start = pos + 1;
			}
		}
		this.bMarks.push(s.length);
		this.eMarks.push(s.length);
		this.tShift.push(0);
		this.sCount.push(0);
		this.bsCount.push(0);
		this.lineMax = this.bMarks.length - 1;
	}
	push(type, tag, nesting) {
		if (nesting === 0) {
			const token$1 = new Token(type, tag, 0);
			token$1.block = true;
			token$1.level = this.level;
			this.tokens.push(token$1);
			return token$1;
		}
		const token = new Token(type, tag, nesting);
		token.block = true;
		if (nesting < 0) this.level--;
		token.level = this.level;
		if (nesting > 0) this.level++;
		this.tokens.push(token);
		return token;
	}
	isEmpty(line) {
		return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
	}
	skipEmptyLines(from) {
		const bMarks = this.bMarks;
		const tShift = this.tShift;
		const eMarks = this.eMarks;
		for (let max = this.lineMax; from < max; from++) if (bMarks[from] + tShift[from] < eMarks[from]) break;
		return from;
	}
	skipSpaces(pos) {
		const src = this.src;
		for (let max = src.length; pos < max; pos++) {
			const ch = src.charCodeAt(pos);
			if (ch !== 9 && ch !== 32) break;
		}
		return pos;
	}
	skipSpacesBack(pos, min) {
		if (pos <= min) return pos;
		const src = this.src;
		while (pos > min) {
			const ch = src.charCodeAt(--pos);
			if (ch !== 9 && ch !== 32) return pos + 1;
		}
		return pos;
	}
	skipChars(pos, code$1) {
		const src = this.src;
		for (let max = src.length; pos < max; pos++) if (src.charCodeAt(pos) !== code$1) break;
		return pos;
	}
	skipCharsBack(pos, code$1, min) {
		if (pos <= min) return pos;
		const src = this.src;
		while (pos > min) if (code$1 !== src.charCodeAt(--pos)) return pos + 1;
		return pos;
	}
	getLines(begin, end, indent, keepLastLF) {
		if (begin >= end) return "";
		if (begin + 1 === end) {
			const line = begin;
			const lineStart = this.bMarks[line];
			let first = lineStart;
			const last = keepLastLF ? this.eMarks[line] + 1 : this.eMarks[line];
			let lineIndent = 0;
			const src$1 = this.src;
			const bsCount$1 = this.bsCount;
			const tShift$1 = this.tShift;
			while (first < last && lineIndent < indent) {
				const ch = src$1.charCodeAt(first);
				if (ch === 9 || ch === 32) if (ch === 9) lineIndent += 4 - (lineIndent + bsCount$1[line]) % 4;
				else lineIndent++;
				else if (first - lineStart < tShift$1[line]) lineIndent++;
				else break;
				first++;
			}
			if (lineIndent > indent) return new Array(lineIndent - indent + 1).join(" ") + src$1.slice(first, last);
			return src$1.slice(first, last);
		}
		const queue = new Array(end - begin);
		const src = this.src;
		const bMarks = this.bMarks;
		const eMarks = this.eMarks;
		const bsCount = this.bsCount;
		const tShift = this.tShift;
		for (let i = 0, line = begin; line < end; line++, i++) {
			let lineIndent = 0;
			const lineStart = bMarks[line];
			let first = lineStart;
			let last;
			if (line + 1 < end || keepLastLF) last = eMarks[line] + 1;
			else last = eMarks[line];
			while (first < last && lineIndent < indent) {
				const ch = src.charCodeAt(first);
				if (isSpace(ch)) if (ch === 9) lineIndent += 4 - (lineIndent + bsCount[line]) % 4;
				else lineIndent++;
				else if (first - lineStart < tShift[line]) lineIndent++;
				else break;
				first++;
			}
			if (lineIndent > indent) queue[i] = new Array(lineIndent - indent + 1).join(" ") + src.slice(first, last);
			else queue[i] = src.slice(first, last);
		}
		return queue.join("");
	}
};
StateBlock.prototype.Token = Token;
const _rules = [
	[
		"table",
		table,
		["paragraph", "reference"]
	],
	["code", code],
	[
		"fence",
		fence,
		[
			"paragraph",
			"reference",
			"blockquote",
			"list"
		]
	],
	[
		"blockquote",
		blockquote,
		[
			"paragraph",
			"reference",
			"blockquote",
			"list"
		]
	],
	[
		"hr",
		hr,
		[
			"paragraph",
			"reference",
			"blockquote",
			"list"
		]
	],
	[
		"list",
		list,
		[
			"paragraph",
			"reference",
			"blockquote"
		]
	],
	["reference", reference],
	[
		"html_block",
		html_block,
		[
			"paragraph",
			"reference",
			"blockquote"
		]
	],
	[
		"heading",
		heading,
		[
			"paragraph",
			"reference",
			"blockquote"
		]
	],
	["lheading", lheading],
	["paragraph", paragraph]
];
var ParserBlock = class {
	ruler;
	cachedRulesVersion = -1;
	cachedRules = [];
	constructor() {
		this.ruler = new BlockRuler();
		for (let i = 0; i < _rules.length; i++) this.ruler.push(_rules[i][0], _rules[i][1], { alt: (_rules[i][2] || []).slice() });
		this.ruler.__mdtsDefaultVersion = this.ruler.version;
	}
	/**
	* Generate tokens for input range
	*/
	tokenize(state, startLine, endLine) {
		const rules = this.getRules();
		const len = rules.length;
		const maxNesting = state.md.options.maxNesting;
		const bMarks = state.bMarks;
		const tShift = state.tShift;
		const eMarks = state.eMarks;
		const sCount = state.sCount;
		let line = startLine;
		let hasEmptyLines = false;
		if (!(!!state.env && (Object.prototype.hasOwnProperty.call(state.env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(state.env, "__mdtsProfileRules")))) {
			while (line < endLine) {
				while (line < endLine && bMarks[line] + tShift[line] >= eMarks[line]) line++;
				state.line = line;
				if (line >= endLine) break;
				if (sCount[line] < state.blkIndent) break;
				if (state.level >= maxNesting) {
					state.line = endLine;
					break;
				}
				const prevLine = state.line;
				let ok = false;
				for (let i = 0; i < len; i++) {
					ok = rules[i](state, line, endLine, false);
					if (ok) {
						if (prevLine >= state.line) throw new Error("block rule didn't increment state.line");
						break;
					}
				}
				if (!ok) throw new Error("none of the block rules matched");
				state.tight = !hasEmptyLines;
				if (bMarks[state.line - 1] + tShift[state.line - 1] >= eMarks[state.line - 1]) hasEmptyLines = true;
				line = state.line;
				if (line < endLine && bMarks[line] + tShift[line] >= eMarks[line]) {
					hasEmptyLines = true;
					line++;
					state.line = line;
				}
			}
			return;
		}
		const namedRules = this.ruler.getNamedRules("");
		while (line < endLine) {
			while (line < endLine && bMarks[line] + tShift[line] >= eMarks[line]) line++;
			state.line = line;
			if (line >= endLine) break;
			if (sCount[line] < state.blkIndent) break;
			if (state.level >= maxNesting) {
				state.line = endLine;
				break;
			}
			const prevLine = state.line;
			let ok = false;
			for (let i = 0; i < len; i++) {
				const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				ok = namedRules[i].fn(state, line, endLine, false);
				const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
				recordRuleInvocation(state.env, "block", namedRules[i].name, endedAt - startedAt, ok, false);
				if (ok) {
					if (prevLine >= state.line) throw new Error("block rule didn't increment state.line");
					break;
				}
			}
			if (!ok) throw new Error("none of the block rules matched");
			state.tight = !hasEmptyLines;
			if (bMarks[state.line - 1] + tShift[state.line - 1] >= eMarks[state.line - 1]) hasEmptyLines = true;
			line = state.line;
			if (line < endLine && bMarks[line] + tShift[line] >= eMarks[line]) {
				hasEmptyLines = true;
				line++;
				state.line = line;
			}
		}
	}
	/**
	* ParserBlock.parse(src, md, env, outTokens)
	*
	* Process input string and push block tokens into `outTokens`
	*/
	parse(src, md, env, outTokens) {
		if (!src || src.length === 0) return;
		const state = new StateBlock(src, md, env, outTokens);
		this.tokenize(state, state.line, state.lineMax);
	}
	getRules() {
		if (this.cachedRulesVersion !== this.ruler.version) {
			this.cachedRules = this.ruler.getRules("");
			this.cachedRulesVersion = this.ruler.version;
		}
		return this.cachedRules;
	}
};
var State = class {
	src;
	env;
	tokens;
	inlineMode;
	md;
	constructor(src, md, env = {}) {
		this.src = typeof src === "string" ? src || "" : src;
		this.env = env;
		this.tokens = [];
		this.inlineMode = false;
		this.md = md;
	}
};
State.prototype.Token = Token;
const CORE_RULES = [
	["normalize", normalize],
	["block", block],
	["inline", inline],
	["linkify", linkify],
	["replacements", replacements],
	["smartquotes", smartquotes],
	["text_join", text_join]
];
const DEFAULT_OPTIONS_TEMPLATE = {
	html: false,
	xhtmlOut: false,
	breaks: false,
	langPrefix: "language-",
	linkify: false,
	typographer: false,
	quotes: "“”‘’",
	maxNesting: 100
};
const DEFAULT_HELPERS = {
	parseLinkLabel,
	parseLinkDestination,
	parseLinkTitle
};
function cloneDefaultOptions() {
	return { ...DEFAULT_OPTIONS_TEMPLATE };
}
function cloneDefaultHelpers() {
	return { ...DEFAULT_HELPERS };
}
var ParserCore = class {
	fallbackParser;
	lastState = null;
	block;
	inline;
	ruler;
	linkifyInstance = null;
	cachedCoreRulesVersion = -1;
	cachedCoreRules = [];
	cachedCoreNamedRulesVersion = -1;
	cachedCoreNamedRules = [];
	constructor() {
		this.block = new ParserBlock();
		this.inline = new ParserInline();
		this.ruler = new CoreRuler();
		for (let i = 0; i < CORE_RULES.length; i++) {
			const [name, rule] = CORE_RULES[i];
			this.ruler.push(name, rule);
		}
		this.fallbackParser = {
			block: this.block,
			inline: this.inline,
			core: this,
			options: cloneDefaultOptions(),
			helpers: cloneDefaultHelpers(),
			normalizeLink,
			normalizeLinkText,
			validateLink,
			linkify: null
		};
	}
	resolveParser(md) {
		if (md) return md;
		if (!this.linkifyInstance) this.linkifyInstance = new linkify_it_default();
		if (this.fallbackParser.block !== this.block) this.fallbackParser.block = this.block;
		if (this.fallbackParser.inline !== this.inline) this.fallbackParser.inline = this.inline;
		this.fallbackParser.core = this;
		this.fallbackParser.linkify = this.linkifyInstance;
		return this.fallbackParser;
	}
	createState(src, env = {}, md) {
		return new State(src, this.resolveParser(md), env);
	}
	getCoreRules() {
		if (this.cachedCoreRulesVersion !== this.ruler.version) {
			this.cachedCoreRules = this.ruler.getRules("");
			this.cachedCoreRulesVersion = this.ruler.version;
		}
		return this.cachedCoreRules;
	}
	getCoreNamedRules() {
		if (this.cachedCoreNamedRulesVersion !== this.ruler.version) {
			this.cachedCoreNamedRules = this.ruler.getNamedRules("");
			this.cachedCoreNamedRulesVersion = this.ruler.version;
		}
		return this.cachedCoreNamedRules;
	}
	process(state) {
		if (!(!!state.env && (Object.prototype.hasOwnProperty.call(state.env, "__mdtsRuleProfile") || Object.prototype.hasOwnProperty.call(state.env, "__mdtsProfileRules")))) {
			const rules = this.getCoreRules();
			for (let i = 0; i < rules.length; i++) rules[i](state);
			return;
		}
		const namedRules = this.getCoreNamedRules();
		for (let i = 0; i < namedRules.length; i++) {
			const startedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
			namedRules[i].fn(state);
			const endedAt = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
			recordRuleInvocation(state.env, "core", namedRules[i].name, endedAt - startedAt, true, false);
		}
		finalizeRuleProfile(state.env);
	}
	parseSource(src, env = {}, md) {
		if (typeof src !== "string" && hasNormalizationChars(src)) return this.parse(sourceToString(src), env, md);
		const state = this.createState(src, env, md);
		this.process(state);
		this.lastState = state;
		return state;
	}
	parse(src, env = {}, md) {
		if (typeof src !== "string") throw new TypeError("Input data should be a String");
		return this.parseSource(src, env, md);
	}
	getTokens() {
		return this.lastState ? this.lastState.tokens : [];
	}
};

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-ts@1.0.0/node_modules/markdown-it-ts/dist/chunk_recommend-BIJ1gfCM.js
const DEFAULTS = {
	maxChunkChars: 1e4,
	maxChunkLines: 200,
	fenceAware: true,
	maxChunks: void 0,
	fallbackOnGlobalState: true
};
/**
* Chunk a markdown document on reasonably safe boundaries (blank-line separated)
* and parse each chunk separately, then merge token streams with line map offsets.
*
* @experimental Markdown is not always chunk-local. The default path falls back
* to a full parse for known document-level state and unsafe chunk boundaries;
* disabling those fallbacks can produce output that differs from full parsing.
*/
function chunkedParse(md, src, env = {}, opts) {
	beginParseDiagnostics(env);
	const options = {
		...DEFAULTS,
		...opts || {}
	};
	const currentGlobalStateReason = detectGlobalMarkdownState(src);
	if (options.fallbackOnGlobalState !== false && currentGlobalStateReason) {
		setChunkDiagnostics(env, {
			count: 1,
			fallback: true,
			fallbackReason: currentGlobalStateReason,
			globalStateDetected: currentGlobalStateReason,
			maxChunkChars: options.maxChunkChars,
			maxChunkLines: options.maxChunkLines
		});
		return runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
			return md.core.parse(src, env, md).tokens;
		});
	}
	let ranges = splitIntoChunkRanges(src, options);
	if (options.maxChunks && ranges.length > options.maxChunks) ranges = rebalanceChunkRanges(ranges, options.maxChunks);
	if (hasUnsafeChunkBoundary(src, ranges)) {
		setChunkDiagnostics(env, {
			count: 1,
			fallback: true,
			fallbackReason: "unsafe-chunk-boundary",
			maxChunkChars: options.maxChunkChars,
			maxChunkLines: options.maxChunkLines
		});
		return runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
			return md.core.parse(src, env, md).tokens;
		});
	}
	let lineOffset = 0;
	const out = [];
	setChunkDiagnostics(env, {
		count: ranges.length,
		maxChunkChars: options.maxChunkChars,
		maxChunkLines: options.maxChunkLines,
		globalStateDetected: currentGlobalStateReason || void 0,
		globalStateFallbackDisabled: options.fallbackOnGlobalState === false && !!currentGlobalStateReason
	});
	return runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
		for (let i = 0; i < ranges.length; i++) {
			const range = ranges[i];
			const ch = src.slice(range.start, range.end);
			const tokens = md.core.parse(ch, env, md).tokens;
			if (lineOffset !== 0 && tokens.length) shiftTokenLines$1(tokens, lineOffset);
			appendTokens$1(out, tokens);
			lineOffset += range.lineCount;
		}
		return out;
	});
}
function splitIntoChunkRanges(src, opts, final = true) {
	const chunks = [];
	let charCount = 0;
	let lineCount = 0;
	let chunkStart = 0;
	let chunkLines = 0;
	let sinceBlankLines = 0;
	let sinceBlankChars = 0;
	let inFence = null;
	function flush(end) {
		if (end <= chunkStart) return;
		chunks.push({
			start: chunkStart,
			end,
			lineCount: chunkLines
		});
		chunkStart = end;
		charCount = 0;
		lineCount = 0;
		chunkLines = 0;
	}
	for (let lineStart = 0; lineStart < src.length;) {
		let lineEnd = src.indexOf("\n", lineStart);
		let lineEndWithNl = lineEnd;
		if (lineEnd === -1) {
			lineEnd = src.length;
			lineEndWithNl = src.length;
		} else lineEndWithNl = lineEnd + 1;
		const blank = isBlankLine$1(src, lineStart, lineEnd);
		if (opts.fenceAware) {
			let p = lineStart;
			while (p < lineEnd) {
				const c = src.charCodeAt(p);
				if (c === 32 || c === 9) p++;
				else break;
			}
			const ch = src[p];
			if (ch === "`" || ch === "~") {
				let q = p;
				while (q < lineEnd && src[q] === ch) q++;
				const runLen = q - p;
				if (runLen >= 3) {
					if (!inFence) inFence = {
						marker: ch,
						length: runLen
					};
					else if (inFence.marker === ch && runLen >= inFence.length) inFence = null;
				}
			}
		}
		const lineWithNlLen = lineEndWithNl - lineStart;
		charCount += lineWithNlLen;
		lineCount += 1;
		chunkLines += 1;
		if (blank) {
			sinceBlankLines = 0;
			sinceBlankChars = 0;
		} else {
			sinceBlankLines += 1;
			sinceBlankChars += lineWithNlLen;
		}
		const atBlankBoundary = blank;
		if ((charCount >= opts.maxChunkChars || lineCount >= opts.maxChunkLines) && !inFence) if (atBlankBoundary) flush(lineEndWithNl);
		else {
			const maxSinceBlankLines = Math.max(10, Math.floor(opts.maxChunkLines * .5));
			const maxSinceBlankChars = Math.max(opts.maxChunkChars, 8e3);
			if (sinceBlankLines >= maxSinceBlankLines || sinceBlankChars >= maxSinceBlankChars) flush(lineEndWithNl);
		}
		lineStart = lineEndWithNl;
	}
	if (final) flush(src.length);
	return chunks;
}
function hasUnsafeChunkBoundary(src, ranges, options = { rangesCoverWholeSource: true }) {
	const limit = options.rangesCoverWholeSource ? ranges.length - 1 : ranges.length;
	for (let i = 0; i < limit; i++) if (!endsAtBlankLine(src, ranges[i].end)) return true;
	return false;
}
function endsAtBlankLine(src, end) {
	if (end <= 0 || end > src.length || src.charCodeAt(end - 1) !== 10) return false;
	let lineStart = end - 2;
	while (lineStart >= 0 && src.charCodeAt(lineStart) !== 10) lineStart--;
	for (let i = lineStart + 1; i < end - 1; i++) {
		const ch = src.charCodeAt(i);
		if (ch !== 32 && ch !== 9 && ch !== 13) return false;
	}
	return true;
}
function shiftTokenLines$1(tokens, offset) {
	if (offset === 0) return;
	const stack = [];
	for (let i = tokens.length - 1; i >= 0; i--) stack.push(tokens[i]);
	while (stack.length) {
		const t = stack.pop();
		if (t.map) {
			t.map[0] += offset;
			t.map[1] += offset;
		}
		if (t.children) for (let i = t.children.length - 1; i >= 0; i--) stack.push(t.children[i]);
	}
}
function appendTokens$1(out, tokens) {
	for (let i = 0; i < tokens.length; i++) out.push(tokens[i]);
}
function rebalanceChunkRanges(chunks, maxChunks) {
	if (chunks.length <= maxChunks) return chunks;
	const out = [];
	let index = 0;
	for (let group = 0; group < maxChunks; group++) {
		const groupsLeft = maxChunks - group;
		const chunksLeft = chunks.length - index;
		const take = Math.ceil(chunksLeft / groupsLeft);
		const slice = chunks.slice(index, index + take);
		let lineCount = 0;
		for (let i = 0; i < slice.length; i++) lineCount += slice[i].lineCount;
		out.push({
			start: slice[0].start,
			end: slice[slice.length - 1].end,
			lineCount
		});
		index += take;
	}
	return out;
}
function isBlankLine$1(src, start, end) {
	for (let i = start; i < end; i++) {
		const ch = src.charCodeAt(i);
		if (ch !== 32 && ch !== 9 && ch !== 13) return false;
	}
	return true;
}
const DEFAULT_AUTO_UNBOUNDED_THRESHOLD_CHARS = 4e6;
const DEFAULT_AUTO_UNBOUNDED_THRESHOLD_LINES = 8e4;
const DEFAULT_FULL_CHUNK_CHARS = 1e4;
const DEFAULT_FULL_CHUNK_LINES = 200;
const DEFAULT_STREAM_CHUNK_CHARS = 1e4;
const DEFAULT_STREAM_CHUNK_LINES = 200;
function appendTokens(out, tokens) {
	for (let i = 0; i < tokens.length; i++) out.push(tokens[i]);
}
function shiftTokenLines(tokens, offset) {
	if (offset === 0) return;
	const stack = [];
	for (let i = tokens.length - 1; i >= 0; i--) stack.push(tokens[i]);
	while (stack.length) {
		const token = stack.pop();
		if (token.map) {
			token.map[0] += offset;
			token.map[1] += offset;
		}
		if (token.children) for (let i = token.children.length - 1; i >= 0; i--) stack.push(token.children[i]);
	}
}
function estimateLines(src) {
	if (src.length === 0) return 0;
	return countLines(src) + (src.charCodeAt(src.length - 1) === 10 ? 0 : 1);
}
function isBlankLine(src, start, end) {
	for (let i = start; i < end; i++) {
		const ch = src.charCodeAt(i);
		if (ch !== 32 && ch !== 9 && ch !== 13) return false;
	}
	return true;
}
function endsInsideFence(src, fenceAware) {
	if (!fenceAware || src.length === 0) return false;
	let inFence = null;
	for (let lineStart = 0; lineStart < src.length;) {
		let lineEnd = src.indexOf("\n", lineStart);
		if (lineEnd === -1) lineEnd = src.length;
		let p = lineStart;
		while (p < lineEnd) {
			const c = src.charCodeAt(p);
			if (c === 32 || c === 9) p++;
			else break;
		}
		const ch = src[p];
		if (ch === "`" || ch === "~") {
			let q = p;
			while (q < lineEnd && src[q] === ch) q++;
			const runLen = q - p;
			if (runLen >= 3) {
				if (!inFence) inFence = {
					marker: ch,
					length: runLen
				};
				else if (inFence.marker === ch && runLen >= inFence.length) inFence = null;
			}
		}
		lineStart = lineEnd === src.length ? src.length : lineEnd + 1;
	}
	return inFence !== null;
}
function endsAtBlankBoundary(src, fenceAware) {
	if (src.length === 0 || src.charCodeAt(src.length - 1) !== 10) return false;
	let prevNl = src.length - 2;
	while (prevNl >= 0 && src.charCodeAt(prevNl) !== 10) prevNl--;
	if (!isBlankLine(src, prevNl + 1, src.length - 1)) return false;
	return !endsInsideFence(src, fenceAware);
}
function resolveWindow(md, totalChars, totalLines, opts = {}) {
	const mode = opts.mode ?? "full";
	const fenceAware = opts.fenceAware ?? (mode === "stream" ? md.options.streamChunkFenceAware ?? true : md.options.fullChunkFenceAware ?? true);
	if (opts.maxChunkChars !== void 0 || opts.maxChunkLines !== void 0 || opts.autoTune === false) {
		const maxChunkChars = opts.maxChunkChars ?? (mode === "stream" ? md.options.streamChunkSizeChars ?? DEFAULT_STREAM_CHUNK_CHARS : md.options.fullChunkSizeChars ?? DEFAULT_FULL_CHUNK_CHARS);
		const maxChunkLines = opts.maxChunkLines ?? (mode === "stream" ? md.options.streamChunkSizeLines ?? DEFAULT_STREAM_CHUNK_LINES : md.options.fullChunkSizeLines ?? DEFAULT_FULL_CHUNK_LINES);
		return {
			maxChunkChars,
			maxChunkLines,
			holdBelowChars: maxChunkChars,
			holdBelowLines: maxChunkLines,
			fenceAware
		};
	}
	if (mode === "stream") {
		if (totalChars <= 5e3) return {
			maxChunkChars: 16e3,
			maxChunkLines: 250,
			holdBelowChars: 16e3,
			holdBelowLines: 250,
			fenceAware
		};
		if (totalChars <= 2e4) return {
			maxChunkChars: 16e3,
			maxChunkLines: 200,
			holdBelowChars: 16e3,
			holdBelowLines: 200,
			fenceAware
		};
		if (totalChars <= 5e4) return {
			maxChunkChars: 16e3,
			maxChunkLines: 250,
			holdBelowChars: 16e3,
			holdBelowLines: 250,
			fenceAware
		};
		if (totalChars <= 5e5) return {
			maxChunkChars: 32e3,
			maxChunkLines: 350,
			holdBelowChars: 32e3,
			holdBelowLines: 350,
			fenceAware
		};
		return {
			maxChunkChars: 64e3,
			maxChunkLines: 700,
			holdBelowChars: 64e3,
			holdBelowLines: 700,
			fenceAware
		};
	}
	if (totalChars <= 1e5 && totalLines <= 2500) return {
		maxChunkChars: 32e3,
		maxChunkLines: 350,
		holdBelowChars: 1e5,
		holdBelowLines: 2500,
		fenceAware
	};
	if (totalChars <= 2e5) return {
		maxChunkChars: 2e4,
		maxChunkLines: 150,
		holdBelowChars: 2e4,
		holdBelowLines: 150,
		fenceAware
	};
	if (totalChars <= 5e5) return {
		maxChunkChars: 32e3,
		maxChunkLines: 350,
		holdBelowChars: 32e3,
		holdBelowLines: 350,
		fenceAware
	};
	return {
		maxChunkChars: 64e3,
		maxChunkLines: 700,
		holdBelowChars: 64e3,
		holdBelowLines: 700,
		fenceAware
	};
}
/**
* Append-only parser for sources that already arrive as chunks.
*
* @experimental Streaming output can be committed before future document-level
* definitions are known. Use full-string parsing when exact full-parse parity
* matters for references, footnotes, abbreviations, or plugin global state.
*/
var UnboundedBuffer = class {
	md;
	options;
	pending = "";
	tokens = [];
	committedChars = 0;
	committedLines = 0;
	fedChunks = 0;
	parsedChunks = 0;
	globalStateEnv = null;
	markedGlobalStateReason = null;
	constructor(md, opts = {}) {
		this.md = md;
		this.options = {
			mode: "full",
			autoTune: true,
			retainTokens: true,
			...opts
		};
		if (this.options.retainTokens === false && !this.options.onChunkTokens) throw new Error("UnboundedBuffer with retainTokens=false requires onChunkTokens");
	}
	feed(chunk) {
		if (!chunk) return;
		this.pending += chunk;
		this.fedChunks += 1;
	}
	flushAvailable(env = {}) {
		if (!this.pending) return null;
		const window = this.resolveWindow();
		const pendingLines = estimateLines(this.pending);
		if (this.pending.length < window.holdBelowChars && pendingLines < window.holdBelowLines) {
			this.updateEnvDiagnostics(env, window, pendingLines);
			return null;
		}
		const ranges = splitIntoChunkRanges(this.pending, {
			maxChunkChars: window.maxChunkChars,
			maxChunkLines: window.maxChunkLines,
			fenceAware: window.fenceAware,
			maxChunks: void 0
		}, false);
		if (!ranges.length) {
			this.updateEnvDiagnostics(env, window, pendingLines);
			return null;
		}
		if (hasUnsafeChunkBoundary(this.pending, ranges, { rangesCoverWholeSource: false })) {
			this.updateEnvDiagnostics(env, window, pendingLines);
			return null;
		}
		const consumed = this.commitRanges(ranges, env);
		this.pending = this.pending.slice(consumed);
		this.updateEnvDiagnostics(env, window, estimateLines(this.pending));
		return this.tokens;
	}
	flushIfBoundary(env = {}) {
		if (!this.pending) return null;
		const window = this.resolveWindow();
		if (!endsAtBlankBoundary(this.pending, window.fenceAware)) {
			this.updateEnvDiagnostics(env, window, estimateLines(this.pending));
			return null;
		}
		const ranges = splitIntoChunkRanges(this.pending, {
			maxChunkChars: window.maxChunkChars,
			maxChunkLines: window.maxChunkLines,
			fenceAware: window.fenceAware,
			maxChunks: void 0
		}, true);
		if (!ranges.length) {
			this.updateEnvDiagnostics(env, window, estimateLines(this.pending));
			return null;
		}
		const rangesToCommit = hasUnsafeChunkBoundary(this.pending, ranges, { rangesCoverWholeSource: true }) ? [{
			start: 0,
			end: this.pending.length,
			lineCount: estimateLines(this.pending)
		}] : ranges;
		this.commitRanges(rangesToCommit, env);
		this.pending = "";
		this.updateEnvDiagnostics(env, window, 0);
		return this.tokens;
	}
	flushForce(env = {}) {
		if (!this.pending) {
			this.prepareGlobalStateEnv(env, "");
			const window$1 = this.resolveWindow();
			this.updateEnvDiagnostics(env, window$1, 0);
			return this.tokens;
		}
		const window = this.resolveWindow();
		const ranges = splitIntoChunkRanges(this.pending, {
			maxChunkChars: window.maxChunkChars,
			maxChunkLines: window.maxChunkLines,
			fenceAware: window.fenceAware,
			maxChunks: void 0
		}, true);
		if (ranges.length) {
			const rangesToCommit = hasUnsafeChunkBoundary(this.pending, ranges, { rangesCoverWholeSource: true }) ? [{
				start: 0,
				end: this.pending.length,
				lineCount: estimateLines(this.pending)
			}] : ranges;
			this.commitRanges(rangesToCommit, env);
			this.pending = "";
		}
		this.updateEnvDiagnostics(env, window, 0);
		return this.tokens;
	}
	reset() {
		this.pending = "";
		this.tokens = [];
		this.committedChars = 0;
		this.committedLines = 0;
		this.fedChunks = 0;
		this.parsedChunks = 0;
		this.globalStateEnv = null;
		this.markedGlobalStateReason = null;
	}
	peek() {
		return this.tokens;
	}
	pendingText() {
		return this.pending;
	}
	stats() {
		return {
			mode: this.options.mode ?? "full",
			fedChunks: this.fedChunks,
			parsedChunks: this.parsedChunks,
			committedChars: this.committedChars,
			committedLines: this.committedLines,
			pendingChars: this.pending.length,
			pendingLines: estimateLines(this.pending),
			retainedTokens: this.options.retainTokens !== false
		};
	}
	resolveWindow() {
		const totalChars = this.committedChars + this.pending.length;
		const totalLines = this.committedLines + estimateLines(this.pending);
		return resolveWindow(this.md, totalChars, totalLines, this.options);
	}
	prepareGlobalStateEnv(env, srcAboutToParse) {
		if (this.globalStateEnv !== env) {
			if (getKnownGlobalMarkdownState(env)) resetKnownGlobalMarkdownState(env);
			this.globalStateEnv = env;
			this.markedGlobalStateReason = null;
		}
		if (this.markedGlobalStateReason) return;
		const reason = detectGlobalMarkdownState(srcAboutToParse);
		if (!reason) return;
		markKnownGlobalMarkdownState(env, reason);
		this.markedGlobalStateReason = reason;
	}
	commitRanges(ranges, env) {
		if (!ranges.length) return 0;
		this.prepareGlobalStateEnv(env, this.pending);
		let consumed = 0;
		try {
			for (let i = 0; i < ranges.length; i++) {
				const range = ranges[i];
				const src = this.pending.slice(range.start, range.end);
				const nextTokens = this.md.core.parse(src, env, this.md).tokens;
				const startOffset = this.committedChars;
				const startLine = this.committedLines;
				if (startLine !== 0 && nextTokens.length) shiftTokenLines(nextTokens, startLine);
				if (this.options.retainTokens !== false) appendTokens(this.tokens, nextTokens);
				this.committedChars += src.length;
				this.committedLines += range.lineCount;
				this.parsedChunks += 1;
				if (this.options.onChunkTokens) this.options.onChunkTokens(nextTokens, {
					chunkIndex: this.parsedChunks,
					chunkChars: src.length,
					chunkLines: range.lineCount,
					tokenCount: nextTokens.length,
					startOffset,
					endOffset: this.committedChars,
					startLine,
					endLine: this.committedLines
				});
				consumed = range.end;
			}
			if (this.markedGlobalStateReason) finalizeKnownGlobalMarkdownState(env);
			return consumed;
		} catch (error$1) {
			if (this.markedGlobalStateReason) {
				resetKnownGlobalMarkdownState(env);
				this.globalStateEnv = null;
				this.markedGlobalStateReason = null;
			}
			throw error$1;
		}
	}
	updateEnvDiagnostics(env, window, pendingLines) {
		setUnboundedDiagnostics(env, {
			mode: this.options.mode ?? "full",
			maxChunkChars: window.maxChunkChars,
			maxChunkLines: window.maxChunkLines,
			committedChars: this.committedChars,
			committedLines: this.committedLines,
			pendingChars: this.pending.length,
			pendingLines,
			fedChunks: this.fedChunks,
			parsedChunks: this.parsedChunks,
			globalStateDetected: this.markedGlobalStateReason || void 0
		});
	}
};
/**
* Parse an iterable chunk source without first joining all chunks.
*
* @experimental This is for explicit chunk-stream inputs. It may flush earlier
* chunks before later document-level definitions are observed.
*/
function parseIterable(md, chunks, env = {}, opts = {}) {
	beginParseDiagnostics(env);
	const buffer = new UnboundedBuffer(md, {
		mode: "full",
		...opts
	});
	for (const chunk of chunks) {
		buffer.feed(chunk);
		buffer.flushAvailable(env);
	}
	return buffer.flushForce(env);
}
/**
* Parse an async iterable chunk source without first joining all chunks.
*
* @experimental This is for explicit chunk-stream inputs. It may flush earlier
* chunks before later document-level definitions are observed.
*/
async function parseAsyncIterable(md, chunks, env = {}, opts = {}) {
	beginParseDiagnostics(env);
	const buffer = new UnboundedBuffer(md, {
		mode: "full",
		...opts
	});
	for await (const chunk of chunks) {
		buffer.feed(chunk);
		buffer.flushAvailable(env);
	}
	return buffer.flushForce(env);
}
/**
* Parse iterable chunks and deliver token chunks to a sink.
*
* @experimental Sink output is streaming-oriented and can differ from a final
* full parse when future document-level definitions affect earlier text.
*/
function parseIterableToSink(md, chunks, onChunkTokens, env = {}, opts = {}) {
	beginParseDiagnostics(env);
	const buffer = new UnboundedBuffer(md, {
		mode: "full",
		...opts,
		retainTokens: false,
		onChunkTokens
	});
	for (const chunk of chunks) {
		buffer.feed(chunk);
		buffer.flushAvailable(env);
	}
	buffer.flushForce(env);
	return buffer.stats();
}
/**
* Parse async iterable chunks and deliver token chunks to a sink.
*
* @experimental Sink output is streaming-oriented and can differ from a final
* full parse when future document-level definitions affect earlier text.
*/
async function parseAsyncIterableToSink(md, chunks, onChunkTokens, env = {}, opts = {}) {
	beginParseDiagnostics(env);
	const buffer = new UnboundedBuffer(md, {
		mode: "full",
		...opts,
		retainTokens: false,
		onChunkTokens
	});
	for await (const chunk of chunks) {
		buffer.feed(chunk);
		buffer.flushAvailable(env);
	}
	buffer.flushForce(env);
	return buffer.stats();
}
function shouldAutoUseUnbounded(md, totalChars, totalLines) {
	if (md.options.autoUnbounded === false) return false;
	const thresholdChars = md.options.autoUnboundedThresholdChars ?? DEFAULT_AUTO_UNBOUNDED_THRESHOLD_CHARS;
	const thresholdLines = md.options.autoUnboundedThresholdLines ?? DEFAULT_AUTO_UNBOUNDED_THRESHOLD_LINES;
	return totalChars >= thresholdChars || totalLines >= thresholdLines;
}
function getAutoUnboundedDecision(md, totalChars, totalLines) {
	if (md.options.autoUnbounded === false) return "no";
	if (totalChars >= (md.options.autoUnboundedThresholdChars ?? DEFAULT_AUTO_UNBOUNDED_THRESHOLD_CHARS)) return "yes";
	const thresholdLines = md.options.autoUnboundedThresholdLines ?? DEFAULT_AUTO_UNBOUNDED_THRESHOLD_LINES;
	if (totalLines !== void 0) return totalLines >= thresholdLines ? "yes" : "no";
	if (totalChars + 1 < thresholdLines) return "no";
	return "need-lines";
}
/**
* Parse a complete string through the unbounded chunking path.
*
* @experimental Defaults to correctness-first fallback for known global-state
* constructs. Disabling the fallback is performance-oriented and can diverge
* from normal full parsing.
*/
function parseStringUnbounded(md, src, env = {}, opts = {}) {
	beginParseDiagnostics(env);
	const currentGlobalStateReason = detectGlobalMarkdownState(src);
	if (getKnownGlobalMarkdownState(env)) resetKnownGlobalMarkdownState(env);
	if (opts.fallbackOnGlobalState !== false && currentGlobalStateReason) {
		setUnboundedDiagnostics(env, {
			mode: "full",
			fallback: true,
			fallbackReason: currentGlobalStateReason,
			committedChars: src.length,
			committedLines: countLines(src),
			pendingChars: 0,
			pendingLines: 0,
			fedChunks: 1,
			parsedChunks: 1,
			globalStateDetected: currentGlobalStateReason
		});
		return runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
			return md.core.parse(src, env, md).tokens;
		});
	}
	const tokens = [];
	const buffer = new UnboundedBuffer(md, {
		mode: "full",
		...opts,
		retainTokens: false,
		onChunkTokens(nextTokens) {
			appendTokens(tokens, nextTokens);
		}
	});
	if (currentGlobalStateReason) markKnownGlobalMarkdownState(env, currentGlobalStateReason);
	buffer.feed(src);
	buffer.flushForce(env);
	if (currentGlobalStateReason) {
		finalizeKnownGlobalMarkdownState(env);
		if (opts.fallbackOnGlobalState === false) {
			const info = getParseDiagnostics(env)?.unbounded;
			if (info) {
				info.globalStateDetected = currentGlobalStateReason;
				info.globalStateFallbackDisabled = true;
			}
		}
	}
	return tokens;
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
function normalizeOptions(opts) {
	return opts.experimental ? {
		...opts,
		...opts.experimental
	} : opts;
}
const FULL_DISCRETE_RECOMMENDATIONS = [
	{
		max: 5e3,
		strategy: "discrete",
		maxChunkChars: 32e3,
		maxChunkLines: 150,
		maxChunks: 8,
		notes: "<=5k"
	},
	{
		max: 2e4,
		strategy: "discrete",
		maxChunkChars: 24e3,
		maxChunkLines: 200,
		maxChunks: 12,
		notes: "<=20k"
	},
	{
		max: 1e5,
		strategy: "plain",
		notes: "<=100k plain"
	},
	{
		max: 2e5,
		strategy: "discrete",
		maxChunkChars: 2e4,
		maxChunkLines: 150,
		maxChunks: 12,
		notes: "<=200k"
	},
	{
		max: 5e5,
		strategy: "discrete",
		maxChunkChars: 64e3,
		maxChunkLines: 700,
		maxChunks: 16,
		notes: "<=500k"
	},
	{
		max: 5e6,
		strategy: "discrete",
		maxChunkChars: 64e3,
		maxChunkLines: 700,
		maxChunks: 16,
		notes: "<=5M"
	}
];
const STREAM_DISCRETE_RECOMMENDATIONS = [
	{
		max: 5e3,
		strategy: "discrete",
		maxChunkChars: 16e3,
		maxChunkLines: 250,
		maxChunks: 8,
		notes: "<=5k"
	},
	{
		max: 2e4,
		strategy: "discrete",
		maxChunkChars: 2e4,
		maxChunkLines: 200,
		maxChunks: 24,
		notes: "<=20k"
	},
	{
		max: 1e5,
		strategy: "discrete",
		maxChunkChars: 2e4,
		maxChunkLines: 200,
		maxChunks: 24,
		notes: "<=100k"
	},
	{
		max: 5e5,
		strategy: "discrete",
		maxChunkChars: 64e3,
		maxChunkLines: 700,
		maxChunks: 32,
		notes: "<=500k"
	},
	{
		max: 5e6,
		strategy: "discrete",
		maxChunkChars: 64e3,
		maxChunkLines: 700,
		maxChunks: 32,
		notes: "<=5M"
	}
];
function toRecommendation(fenceAware, discrete) {
	return {
		strategy: discrete.strategy,
		maxChunkChars: discrete.maxChunkChars,
		maxChunkLines: discrete.maxChunkLines,
		maxChunks: discrete.maxChunks,
		fenceAware,
		notes: discrete.notes
	};
}
/**
* Suggest full-parse chunk settings for the current synthetic harness defaults.
*
* @experimental Recommendations are workload-dependent; validate on the corpus
* you plan to parse.
*/
function recommendFullChunkStrategy(sizeChars, sizeLines = Math.max(0, sizeChars / 40 | 0), opts = {}) {
	const options = normalizeOptions(opts);
	const fenceAware = options.fullChunkFenceAware ?? true;
	const target = options.fullChunkTargetChunks ?? 8;
	const adaptive = options.fullChunkAdaptive !== false;
	for (let i = 0; i < FULL_DISCRETE_RECOMMENDATIONS.length; i++) {
		const rec = FULL_DISCRETE_RECOMMENDATIONS[i];
		if (sizeChars <= rec.max) {
			if (rec.strategy !== "adaptive") return toRecommendation(fenceAware, rec);
			break;
		}
	}
	if (sizeChars > 5e6) return {
		strategy: "plain",
		fenceAware,
		notes: ">5M plain"
	};
	if (adaptive) return {
		strategy: "adaptive",
		maxChunkChars: clamp(Math.ceil(sizeChars / target), 8e3, 64e3),
		maxChunkLines: clamp(Math.ceil(sizeLines / target), 150, 700),
		maxChunks: clamp(Math.ceil(sizeChars / 64e3), target, 16),
		fenceAware,
		notes: "adaptive fallback"
	};
	return {
		strategy: "discrete",
		maxChunkChars: options.fullChunkSizeChars ?? 1e4,
		maxChunkLines: options.fullChunkSizeLines ?? 200,
		fenceAware,
		maxChunks: options.fullChunkMaxChunks
	};
}
/**
* Suggest stream chunk settings for the current synthetic harness defaults.
*
* @experimental Recommendations are workload-dependent; validate on the corpus
* you plan to parse.
*/
function recommendStreamChunkStrategy(sizeChars, sizeLines = Math.max(0, sizeChars / 40 | 0), opts = {}) {
	const options = normalizeOptions(opts);
	const fenceAware = options.streamChunkFenceAware ?? true;
	const target = options.streamChunkTargetChunks ?? 8;
	const adaptive = options.streamChunkAdaptive !== false;
	for (let i = 0; i < STREAM_DISCRETE_RECOMMENDATIONS.length; i++) {
		const rec = STREAM_DISCRETE_RECOMMENDATIONS[i];
		if (sizeChars <= rec.max) {
			if (rec.strategy !== "adaptive") return toRecommendation(fenceAware, rec);
			break;
		}
	}
	if (sizeChars > 5e6) return {
		strategy: "plain",
		fenceAware,
		notes: ">5M plain"
	};
	if (adaptive) return {
		strategy: "adaptive",
		maxChunkChars: clamp(Math.ceil(sizeChars / target), 8e3, 64e3),
		maxChunkLines: clamp(Math.ceil(sizeLines / target), 150, 700),
		maxChunks: clamp(Math.ceil(sizeChars / 64e3), target, 32),
		fenceAware,
		notes: "adaptive fallback"
	};
	return {
		strategy: "discrete",
		maxChunkChars: options.streamChunkSizeChars ?? 1e4,
		maxChunkLines: options.streamChunkSizeLines ?? 200,
		maxChunks: options.streamChunkMaxChunks,
		fenceAware
	};
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-ts@1.0.0/node_modules/markdown-it-ts/dist/index.js
var commonmark_default = {
	options: {
		html: true,
		xhtmlOut: true,
		breaks: false,
		langPrefix: "language-",
		linkify: false,
		typographer: false,
		quotes: "“”‘’",
		highlight: null,
		maxNesting: 20
	},
	components: {
		core: { rules: [
			"normalize",
			"block",
			"inline",
			"text_join"
		] },
		block: { rules: [
			"blockquote",
			"code",
			"fence",
			"heading",
			"hr",
			"html_block",
			"lheading",
			"list",
			"reference",
			"paragraph"
		] },
		inline: { rules: [
			"autolink",
			"backticks",
			"emphasis",
			"entity",
			"escape",
			"html_inline",
			"image",
			"link",
			"newline",
			"text"
		] },
		inline2: { rules: [
			"balance_pairs",
			"emphasis",
			"fragments_join"
		] }
	}
};
var default_default = {
	options: {
		html: false,
		xhtmlOut: false,
		breaks: false,
		langPrefix: "language-",
		linkify: false,
		typographer: false,
		quotes: "“”‘’",
		highlight: null,
		maxNesting: 100
	},
	components: {
		core: {},
		block: {},
		inline: {}
	}
};
var zero_default = {
	options: {
		html: false,
		xhtmlOut: false,
		breaks: false,
		langPrefix: "language-",
		linkify: false,
		typographer: false,
		quotes: "“”‘’",
		maxNesting: 20
	},
	components: {
		core: { rules: [
			"normalize",
			"block",
			"inline",
			"text_join"
		] },
		block: { rules: ["paragraph"] },
		inline: { rules: ["text"] },
		inline2: { rules: ["balance_pairs", "fragments_join"] }
	}
};
const HTML_ESCAPE_TEST_RE = /[&<>"]/;
const HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
const HTML_ESCAPE_AMP_RE = /&/g;
const HTML_ESCAPE_NO_AMP_RE = /[<>"]/g;
const HTML_REPLACEMENTS = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
};
function replaceUnsafeChar(ch) {
	return HTML_REPLACEMENTS[ch] || ch;
}
/**
* Escape HTML characters to prevent XSS
*/
function escapeHtml$2(str) {
	if (str.length === 0) return "";
	if (str.length < 32) {
		if (HTML_ESCAPE_TEST_RE.test(str)) return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
		return str;
	}
	const hasAmp = str.includes("&");
	const hasLt = str.includes("<");
	const hasGt = str.includes(">");
	const hasQuot = str.includes("\"");
	if (!hasAmp && !hasLt && !hasGt && !hasQuot) return str;
	if (hasAmp && !hasLt && !hasGt && !hasQuot) return str.replace(HTML_ESCAPE_AMP_RE, "&amp;");
	if (!hasAmp) return str.replace(HTML_ESCAPE_NO_AMP_RE, replaceUnsafeChar);
	return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
}
const UNESCAPE_ALL_RE = new RegExp(`${/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g.source}|${/&([a-z#][a-z0-9]{1,31});/gi.source}`, "gi");
const DIGITAL_ENTITY_TEST_RE = /^#(?:x[a-f0-9]{1,8}|\d{1,8})$/i;
/**
* Unescape all backslash escapes and HTML entities
*/
function unescapeAll(str) {
	if (!str.includes("\\") && !str.includes("&")) return str;
	return str.replace(UNESCAPE_ALL_RE, (match, escaped, entity$1) => {
		if (escaped) return escaped;
		if (DIGITAL_ENTITY_TEST_RE.test(entity$1)) {
			const code$1 = entity$1[1].toLowerCase() === "x" ? Number.parseInt(entity$1.slice(2), 16) : Number.parseInt(entity$1.slice(1), 10);
			return isValidEntityCode(code$1) ? fromCodePoint(code$1) : "�";
		}
		const decoded = decodeHTML(match);
		return decoded !== match ? decoded : match;
	});
}
function isPromiseLike(value) {
	return !!value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
function ensureSyncResult(value, ruleName) {
	if (isPromiseLike(value)) throw new TypeError(`Renderer rule "${ruleName}" returned a Promise. Use renderAsync() instead.`);
	return value;
}
const resolveResult = (value) => isPromiseLike(value) ? value : Promise.resolve(value);
function renderAttrName(name) {
	switch (name) {
		case "alt":
		case "class":
		case "href":
		case "id":
		case "lang":
		case "rel":
		case "src":
		case "start":
		case "style":
		case "target":
		case "title": return name;
		default: return escapeHtml$2(name);
	}
}
function renderAttrsFromList(attrs) {
	if (!attrs || attrs.length === 0) return "";
	const firstAttr = attrs[0];
	let result = ` ${renderAttrName(firstAttr[0])}="${escapeHtml$2(firstAttr[1])}"`;
	for (let i = 1; i < attrs.length; i++) {
		const attr = attrs[i];
		result += ` ${renderAttrName(attr[0])}="${escapeHtml$2(attr[1])}"`;
	}
	return result;
}
function parseFenceInfo(info) {
	if (!info) return {
		langName: "",
		langAttrs: ""
	};
	let markerEnd = 0;
	while (markerEnd < info.length) {
		const ch = info.charCodeAt(markerEnd);
		if (ch === 32 || ch === 9 || ch === 10) break;
		markerEnd++;
	}
	if (markerEnd >= info.length) return {
		langName: info,
		langAttrs: ""
	};
	let attrsStart = markerEnd;
	while (attrsStart < info.length) {
		const ch = info.charCodeAt(attrsStart);
		if (ch !== 32 && ch !== 9 && ch !== 10) break;
		attrsStart++;
	}
	return {
		langName: info.slice(0, markerEnd),
		langAttrs: attrsStart < info.length ? info.slice(attrsStart) : ""
	};
}
function renderFence(token, highlighted, info, langName, options) {
	if (highlighted.indexOf("<pre") === 0) return `${highlighted}\n`;
	if (info) {
		if (!token.attrs || token.attrs.length === 0) return `<pre><code class="${escapeHtml$2(`${options.langPrefix ?? "language-"}${langName}`)}">${highlighted}</code></pre>\n`;
		const classIndex = token.attrIndex("class");
		const tmpAttrs = token.attrs ? token.attrs.slice() : [];
		const langClass = `${options.langPrefix ?? "language-"}${langName}`;
		if (classIndex < 0) tmpAttrs.push(["class", langClass]);
		else {
			tmpAttrs[classIndex] = tmpAttrs[classIndex].slice();
			tmpAttrs[classIndex][1] += ` ${langClass}`;
		}
		return `<pre><code${renderAttrsFromList(tmpAttrs)}>${highlighted}</code></pre>\n`;
	}
	return `<pre><code${renderAttrsFromList(token.attrs)}>${highlighted}</code></pre>\n`;
}
function renderCodeInlineToken(token) {
	if (!token.attrs || token.attrs.length === 0) return `<code>${escapeHtml$2(token.content)}</code>`;
	return `<code${renderAttrsFromList(token.attrs)}>${escapeHtml$2(token.content)}</code>`;
}
function renderCodeBlockToken(token) {
	const content = escapeHtml$2(token.content);
	if (!token.attrs) return `<pre><code>${content}</code></pre>\n`;
	return `<pre${renderAttrsFromList(token.attrs)}><code>${content}</code></pre>\n`;
}
function renderFastBlockOpenWithInline(token, prefix) {
	const attrs = token.attrs;
	if (!attrs || attrs.length === 0) switch (token.type) {
		case "paragraph_open": return `${prefix}<p>`;
		case "heading_open": return `<${token.tag}>`;
		case "td_open": return `${prefix}<td>`;
		case "th_open": return `${prefix}<th>`;
		default: return null;
	}
	if (attrs.length === 1 && attrs[0][0] === "style") {
		if (token.type === "td_open") return `${prefix}<td style="${escapeHtml$2(attrs[0][1])}">`;
		if (token.type === "th_open") return `${prefix}<th style="${escapeHtml$2(attrs[0][1])}">`;
	}
	return null;
}
function renderLinkOpenToken(token) {
	const attrs = token.attrs;
	if (!attrs || attrs.length === 0) return "<a>";
	if (attrs.length === 1) return `<a ${renderAttrName(attrs[0][0])}="${escapeHtml$2(attrs[0][1])}">`;
	if (attrs.length === 2) return `<a ${renderAttrName(attrs[0][0])}="${escapeHtml$2(attrs[0][1])}" ${renderAttrName(attrs[1][0])}="${escapeHtml$2(attrs[1][1])}">`;
	return `<a${renderAttrsFromList(attrs)}>`;
}
function canUseLinkInlineFastPath(token) {
	switch (token.type) {
		case "text":
		case "text_special":
		case "softbreak":
		case "hardbreak":
		case "html_inline":
		case "code_inline":
		case "image": return true;
		default: return false;
	}
}
function canUseWrappedInlineFastPath(token) {
	switch (token.type) {
		case "text":
		case "text_special":
		case "softbreak":
		case "hardbreak":
		case "html_inline":
		case "code_inline": return true;
		default: return false;
	}
}
function renderFlatToken(token, xhtmlOut) {
	if (token.hidden) return "";
	const attrs = token.attrs;
	const nesting = token.nesting;
	const tag = token.tag;
	if (!attrs || attrs.length === 0) {
		if (nesting === 0) return xhtmlOut ? `<${tag} />` : `<${tag}>`;
		return nesting === -1 ? `</${tag}>` : `<${tag}>`;
	}
	let result = (nesting === -1 ? "</" : "<") + tag + renderAttrsFromList(attrs);
	if (nesting === 0 && xhtmlOut) result += " /";
	return `${result}>`;
}
const DEFAULT_RENDERER_OPTIONS = {
	langPrefix: "language-",
	xhtmlOut: false,
	breaks: false
};
const hasOwn$1 = Object.prototype.hasOwnProperty;
const defaultRules = {
	code_inline(tokens, idx) {
		return renderCodeInlineToken(tokens[idx]);
	},
	code_block(tokens, idx) {
		return renderCodeBlockToken(tokens[idx]);
	},
	fence(tokens, idx, options, _env, _self) {
		const token = tokens[idx];
		const info = token.info ? unescapeAll(token.info).trim() : "";
		const { langName, langAttrs } = parseFenceInfo(info);
		const highlight = options.highlight;
		const fallback = escapeHtml$2(token.content);
		if (!highlight) return renderFence(token, fallback, info, langName, options);
		const highlighted = highlight(token.content, langName, langAttrs);
		if (isPromiseLike(highlighted)) return highlighted.then((res) => renderFence(token, res || fallback, info, langName, options));
		return renderFence(token, highlighted || fallback, info, langName, options);
	},
	image(tokens, idx, options, env, self) {
		const token = tokens[idx];
		const altText = self.renderInlineAsText(token.children || [], options, env);
		const altIndex = token.attrIndex("alt");
		if (altIndex >= 0 && token.attrs) token.attrs[altIndex][1] = altText;
		else if (token.attrs) token.attrs.push(["alt", altText]);
		else token.attrs = [["alt", altText]];
		return renderFlatToken(token, options.xhtmlOut === true);
	},
	hardbreak(_tokens, _idx, options) {
		return options.xhtmlOut ? "<br />\n" : "<br>\n";
	},
	softbreak(_tokens, _idx, options) {
		return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
	},
	text(tokens, idx) {
		return escapeHtml$2(tokens[idx].content);
	},
	text_special(tokens, idx) {
		return escapeHtml$2(tokens[idx].content);
	},
	html_block(tokens, idx) {
		return tokens[idx].content;
	},
	html_inline(tokens, idx) {
		return tokens[idx].content;
	}
};
function renderFenceSyncToken(token, options, _self) {
	const info = token.info ? unescapeAll(token.info).trim() : "";
	const { langName, langAttrs } = parseFenceInfo(info);
	const highlight = options.highlight;
	const fallback = escapeHtml$2(token.content);
	if (!highlight) return renderFence(token, fallback, info, langName, options);
	const highlighted = highlight(token.content, langName, langAttrs);
	if (isPromiseLike(highlighted)) throw new TypeError("Renderer rule \"fence\" returned a Promise. Use renderAsync() instead.");
	return renderFence(token, highlighted || fallback, info, langName, options);
}
function renderSingleInlineTokenSync(tokens, options, env, self, rules, inlineBreak, softbreak) {
	const token = tokens[0];
	switch (token.type) {
		case "text":
			if (rules.text === defaultRules.text) return token.content.length === 0 ? "" : escapeHtml$2(token.content);
			break;
		case "text_special":
			if (rules.text_special === defaultRules.text_special) return token.content.length === 0 ? "" : escapeHtml$2(token.content);
			break;
		case "softbreak":
			if (rules.softbreak === defaultRules.softbreak) return softbreak;
			break;
		case "hardbreak":
			if (rules.hardbreak === defaultRules.hardbreak) return inlineBreak;
			break;
		case "html_inline":
			if (rules.html_inline === defaultRules.html_inline) return token.content;
			break;
		case "code_inline":
			if (rules.code_inline === defaultRules.code_inline) return renderCodeInlineToken(token);
			break;
		default: break;
	}
	const rule = rules[token.type];
	if (!rule) return renderFlatToken(token, options.xhtmlOut === true);
	const rendered = rule(tokens, 0, options, env, self);
	if (typeof rendered === "string") return rendered;
	return ensureSyncResult(rendered, token.type);
}
var Renderer = class {
	rules;
	baseOptions;
	normalizedBase;
	constructor(options = {}) {
		this.baseOptions = { ...options };
		this.normalizedBase = this.buildNormalizedBase();
		this.rules = { ...defaultRules };
	}
	set(options) {
		this.baseOptions = {
			...this.baseOptions,
			...options
		};
		this.normalizedBase = this.buildNormalizedBase();
		return this;
	}
	render(tokens, options, env) {
		if (!Array.isArray(tokens)) throw new TypeError("render expects token array as first argument");
		if (tokens.length === 1) return this.renderSingleToken(tokens, tokens[0], options, env);
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		const rules = this.rules;
		const xhtmlOut = merged.xhtmlOut === true;
		let textRule;
		let textSpecialRule;
		let softbreakRule;
		let hardbreakRule;
		let htmlInlineRule;
		let codeInlineRule;
		let inlineBreak = "";
		let softbreak = "";
		let inlineFastPathReady = false;
		let result = "";
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			const type = token.type;
			const prefix = i > 0 && tokens[i - 1].hidden ? "\n" : "";
			if (type === "list_item_open" && (!token.attrs || token.attrs.length === 0) && i + 3 < tokens.length) {
				const paragraphOpen = tokens[i + 1];
				const inlineToken = tokens[i + 2];
				const paragraphClose = tokens[i + 3];
				if (paragraphOpen.type === "paragraph_open" && paragraphOpen.hidden && inlineToken.type === "inline" && paragraphClose.type === "paragraph_close" && paragraphClose.hidden) {
					result += `${prefix}<li>${this.renderInlineTokens(inlineToken.children || [], merged, envRef)}`;
					i += 3;
					continue;
				}
			}
			if (i + 2 < tokens.length) {
				const inlineToken = tokens[i + 1];
				const closeToken = tokens[i + 2];
				if (inlineToken.type === "inline" && closeToken.nesting === -1 && closeToken.tag === token.tag && !closeToken.hidden) {
					const open = renderFastBlockOpenWithInline(token, prefix);
					if (open !== null) {
						result += `${open + this.renderInlineTokens(inlineToken.children || [], merged, envRef)}</${token.tag}>\n`;
						i += 2;
						continue;
					}
				}
			}
			if (type === "inline") {
				const children = token.children || [];
				if (children.length === 1) {
					if (!inlineFastPathReady) {
						textRule = rules.text;
						textSpecialRule = rules.text_special;
						softbreakRule = rules.softbreak;
						hardbreakRule = rules.hardbreak;
						htmlInlineRule = rules.html_inline;
						codeInlineRule = rules.code_inline;
						inlineBreak = merged.xhtmlOut ? "<br />\n" : "<br>\n";
						softbreak = merged.breaks ? inlineBreak : "\n";
						inlineFastPathReady = true;
					}
					const child = children[0];
					switch (child.type) {
						case "text":
							if (textRule === defaultRules.text) {
								result += escapeHtml$2(child.content);
								continue;
							}
							break;
						case "text_special":
							if (textSpecialRule === defaultRules.text_special) {
								result += escapeHtml$2(child.content);
								continue;
							}
							break;
						case "softbreak":
							if (softbreakRule === defaultRules.softbreak) {
								result += softbreak;
								continue;
							}
							break;
						case "hardbreak":
							if (hardbreakRule === defaultRules.hardbreak) {
								result += inlineBreak;
								continue;
							}
							break;
						case "html_inline":
							if (htmlInlineRule === defaultRules.html_inline) {
								result += child.content;
								continue;
							}
							break;
						case "code_inline":
							if (codeInlineRule === defaultRules.code_inline) {
								result += renderCodeInlineToken(child);
								continue;
							}
							break;
						default: break;
					}
				}
				result += this.renderInlineTokens(children, merged, envRef);
				continue;
			}
			const rule = rules[type];
			if (!rule) {
				const attrs = token.attrs;
				if (!token.hidden) {
					if (!attrs || attrs.length === 0) switch (type) {
						case "hr":
							result += xhtmlOut ? "<hr />\n" : "<hr>\n";
							continue;
						case "heading_open":
							result += `<${token.tag}>`;
							continue;
						case "heading_close":
							result += `</${token.tag}>\n`;
							continue;
						case "paragraph_open":
							result += `${prefix}<p>`;
							continue;
						case "paragraph_close":
							result += "</p>\n";
							continue;
						case "list_item_open": {
							const nextToken = tokens[i + 1];
							result += prefix + (nextToken && (nextToken.type === "inline" || nextToken.hidden || nextToken.nesting === -1 && nextToken.tag === "li") ? "<li>" : "<li>\n");
							continue;
						}
						case "list_item_close":
							result += "</li>\n";
							continue;
						case "bullet_list_open":
							result += `${prefix}<ul>\n`;
							continue;
						case "bullet_list_close":
							result += "</ul>\n";
							continue;
						case "blockquote_open":
							result += prefix + (tokens[i + 1] && tokens[i + 1].nesting === -1 && tokens[i + 1].tag === "blockquote" ? "<blockquote>" : "<blockquote>\n");
							continue;
						case "blockquote_close":
							result += "</blockquote>\n";
							continue;
						case "ordered_list_open":
							result += `${prefix}<ol>\n`;
							continue;
						case "ordered_list_close":
							result += "</ol>\n";
							continue;
						case "table_open":
							result += `${prefix}<table>\n`;
							continue;
						case "table_close":
							result += "</table>\n";
							continue;
						case "thead_open":
							result += `${prefix}<thead>\n`;
							continue;
						case "thead_close":
							result += "</thead>\n";
							continue;
						case "tbody_open":
							result += `${prefix}<tbody>\n`;
							continue;
						case "tbody_close":
							result += "</tbody>\n";
							continue;
						case "tr_open":
							result += `${prefix}<tr>\n`;
							continue;
						case "tr_close":
							result += "</tr>\n";
							continue;
						case "td_open":
							result += `${prefix}<td>`;
							continue;
						case "td_close":
							result += "</td>\n";
							continue;
						case "th_open":
							result += `${prefix}<th>`;
							continue;
						case "th_close":
							result += "</th>\n";
							continue;
						default: break;
					}
					else if (attrs.length === 1) {
						const attr = attrs[0];
						if (type === "ordered_list_open" && attr[0] === "start") {
							result += `${prefix}<ol start="${escapeHtml$2(attr[1])}">\n`;
							continue;
						}
						if (type === "td_open" && attr[0] === "style") {
							result += `${prefix}<td style="${escapeHtml$2(attr[1])}">`;
							continue;
						}
						if (type === "th_open" && attr[0] === "style") {
							result += `${prefix}<th style="${escapeHtml$2(attr[1])}">`;
							continue;
						}
					}
				}
				result += this.renderToken(tokens, i, merged);
				continue;
			}
			if (type === "code_block" && rule === defaultRules.code_block) {
				result += renderCodeBlockToken(token);
				continue;
			}
			if (type === "fence" && rule === defaultRules.fence) {
				result += renderFenceSyncToken(token, merged, this);
				continue;
			}
			if (type === "html_block" && rule === defaultRules.html_block) {
				result += token.content;
				continue;
			}
			const rendered = rule(tokens, i, merged, envRef, this);
			if (typeof rendered === "string") result += rendered;
			else result += ensureSyncResult(rendered, token.type);
		}
		return result;
	}
	async renderAsync(tokens, options, env) {
		if (!Array.isArray(tokens)) throw new TypeError("render expects token array as first argument");
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		const rules = this.rules;
		let result = "";
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.type === "inline") {
				result += await this.renderInlineTokensAsync(token.children || [], merged, envRef);
				continue;
			}
			const rule = rules[token.type];
			if (rule) result += await resolveResult(rule(tokens, i, merged, envRef, this));
			else result += this.renderToken(tokens, i, merged);
		}
		return result;
	}
	renderInline(tokens, options, env) {
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		return this.renderInlineTokens(tokens, merged, envRef);
	}
	async renderInlineAsync(tokens, options, env) {
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		return this.renderInlineTokensAsync(tokens, merged, envRef);
	}
	renderInlineAsText(tokens, options, env) {
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		return this.renderInlineAsTextInternal(tokens, merged, envRef);
	}
	renderAttrs(token) {
		return renderAttrsFromList(token.attrs);
	}
	renderToken(tokens, idx, options) {
		const token = tokens[idx];
		if (token.hidden) return "";
		const block$1 = token.block;
		const nesting = token.nesting;
		const tag = token.tag;
		const attrs = token.attrs;
		let needLineFeed = false;
		if (block$1) {
			needLineFeed = true;
			if (nesting === 1 && idx + 1 < tokens.length) {
				const nextToken = tokens[idx + 1];
				if (nextToken.type === "inline" || nextToken.hidden) needLineFeed = false;
				else if (nextToken.nesting === -1 && nextToken.tag === tag) needLineFeed = false;
			}
		}
		const prefix = block$1 && nesting !== -1 && idx > 0 && tokens[idx - 1].hidden ? "\n" : "";
		const suffix = needLineFeed ? ">\n" : ">";
		if (!attrs || attrs.length === 0) {
			if (nesting === 0) {
				if (options.xhtmlOut) return `${prefix}<${tag} /${suffix}`;
				return `${prefix}<${tag}${suffix}`;
			}
			if (nesting === -1) return `${prefix}</${tag}${suffix}`;
			return `${prefix}<${tag}${suffix}`;
		}
		let result = prefix + (nesting === -1 ? "</" : "<") + tag + renderAttrsFromList(attrs);
		if (nesting === 0 && options.xhtmlOut) result += " /";
		return result + suffix;
	}
	mergeOptions(overrides) {
		const base$1 = this.normalizedBase;
		if (!overrides) return base$1;
		if (overrides.highlight === base$1.highlight && overrides.langPrefix === base$1.langPrefix && overrides.xhtmlOut === base$1.xhtmlOut && overrides.breaks === base$1.breaks) return base$1;
		let merged = null;
		const ensureMerged = () => {
			if (!merged) merged = { ...base$1 };
			return merged;
		};
		if (hasOwn$1.call(overrides, "highlight") && overrides.highlight !== base$1.highlight) ensureMerged().highlight = overrides.highlight;
		if (hasOwn$1.call(overrides, "langPrefix")) {
			const value = overrides.langPrefix;
			if (value !== base$1.langPrefix) ensureMerged().langPrefix = value;
		}
		if (hasOwn$1.call(overrides, "xhtmlOut")) {
			const value = overrides.xhtmlOut;
			if (value !== base$1.xhtmlOut) ensureMerged().xhtmlOut = value;
		}
		if (hasOwn$1.call(overrides, "breaks")) {
			const value = overrides.breaks;
			if (value !== base$1.breaks) ensureMerged().breaks = value;
		}
		return merged || base$1;
	}
	buildNormalizedBase() {
		return Object.freeze({
			...DEFAULT_RENDERER_OPTIONS,
			...this.baseOptions
		});
	}
	renderSingleToken(tokens, token, options, env) {
		const rules = this.rules;
		const type = token.type;
		if (type === "code_block" && rules.code_block === defaultRules.code_block) return renderCodeBlockToken(token);
		if (type === "html_block" && rules.html_block === defaultRules.html_block) return token.content;
		const merged = this.mergeOptions(options);
		const envRef = env ?? {};
		if (type === "inline") return this.renderInlineTokens(token.children || [], merged, envRef);
		const rule = rules[type];
		if (!rule) return token.block ? this.renderToken(tokens, 0, merged) : renderFlatToken(token, merged.xhtmlOut === true);
		if (type === "fence" && rule === defaultRules.fence) return renderFenceSyncToken(token, merged, this);
		const rendered = rule(tokens, 0, merged, envRef, this);
		if (typeof rendered === "string") return rendered;
		return ensureSyncResult(rendered, type);
	}
	renderInlineTokens(tokens, options, env) {
		if (!tokens || tokens.length === 0) return "";
		const rules = this.rules;
		const textRule = rules.text;
		const textSpecialRule = rules.text_special;
		const softbreakRule = rules.softbreak;
		const hardbreakRule = rules.hardbreak;
		const htmlInlineRule = rules.html_inline;
		const codeInlineRule = rules.code_inline;
		const linkOpenRule = rules.link_open;
		const linkCloseRule = rules.link_close;
		const emOpenRule = rules.em_open;
		const emCloseRule = rules.em_close;
		const strongOpenRule = rules.strong_open;
		const strongCloseRule = rules.strong_close;
		const xhtmlOut = options.xhtmlOut === true;
		const inlineBreak = xhtmlOut ? "<br />\n" : "<br>\n";
		const softbreak = options.breaks ? inlineBreak : "\n";
		if (tokens.length === 1) return renderSingleInlineTokenSync(tokens, options, env, this, rules, inlineBreak, softbreak);
		let result = "";
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.type === "link_open" && !linkOpenRule && !linkCloseRule && i + 2 < tokens.length) {
				const bodyToken = tokens[i + 1];
				if (tokens[i + 2].type === "link_close" && canUseLinkInlineFastPath(bodyToken)) {
					const renderedLink = `${renderLinkOpenToken(token) + renderSingleInlineTokenSync([bodyToken], options, env, this, rules, inlineBreak, softbreak)}</a>`;
					if (softbreakRule === defaultRules.softbreak && i + 3 < tokens.length && tokens[i + 3].type === "softbreak") {
						result += renderedLink + softbreak;
						i += 3;
						continue;
					}
					result += renderedLink;
					i += 2;
					continue;
				}
			}
			if (token.type === "link_open" && !linkOpenRule && !linkCloseRule && i + 1 < tokens.length) {
				if (tokens[i + 1].type === "link_close") {
					result += `${renderLinkOpenToken(token)}</a>`;
					i += 1;
					continue;
				}
			}
			if (token.type === "em_open" && !emOpenRule && !emCloseRule && i + 2 < tokens.length) {
				const bodyToken = tokens[i + 1];
				if (tokens[i + 2].type === "em_close" && canUseWrappedInlineFastPath(bodyToken)) {
					result += `<em>${renderSingleInlineTokenSync([bodyToken], options, env, this, rules, inlineBreak, softbreak)}</em>`;
					i += 2;
					continue;
				}
			}
			if (token.type === "strong_open" && !strongOpenRule && !strongCloseRule && i + 2 < tokens.length) {
				const bodyToken = tokens[i + 1];
				if (tokens[i + 2].type === "strong_close" && canUseWrappedInlineFastPath(bodyToken)) {
					result += `<strong>${renderSingleInlineTokenSync([bodyToken], options, env, this, rules, inlineBreak, softbreak)}</strong>`;
					i += 2;
					continue;
				}
			}
			switch (token.type) {
				case "text":
					if (textRule === defaultRules.text) {
						const escaped = token.content.length === 0 ? "" : escapeHtml$2(token.content);
						if (htmlInlineRule === defaultRules.html_inline && i + 1 < tokens.length && tokens[i + 1].type === "html_inline") {
							result += escaped + tokens[++i].content;
							while (i + 1 < tokens.length && tokens[i + 1].type === "html_inline") result += tokens[++i].content;
							continue;
						}
						result += escaped;
						continue;
					}
					break;
				case "text_special":
					if (textSpecialRule === defaultRules.text_special) {
						if (token.content.length !== 0) result += escapeHtml$2(token.content);
						continue;
					}
					break;
				case "softbreak":
					if (softbreakRule === defaultRules.softbreak) {
						result += softbreak;
						continue;
					}
					break;
				case "hardbreak":
					if (hardbreakRule === defaultRules.hardbreak) {
						result += inlineBreak;
						continue;
					}
					break;
				case "html_inline":
					if (htmlInlineRule === defaultRules.html_inline) {
						result += token.content;
						while (i + 1 < tokens.length && tokens[i + 1].type === "html_inline") result += tokens[++i].content;
						continue;
					}
					break;
				case "code_inline":
					if (codeInlineRule === defaultRules.code_inline) {
						result += renderCodeInlineToken(token);
						continue;
					}
					break;
				default: break;
			}
			const rule = rules[token.type];
			if (!rule) {
				result += token.block ? this.renderToken(tokens, i, options) : renderFlatToken(token, xhtmlOut);
				continue;
			}
			const rendered = rule(tokens, i, options, env, this);
			if (typeof rendered === "string") result += rendered;
			else result += ensureSyncResult(rendered, token.type);
		}
		return result;
	}
	async renderInlineTokensAsync(tokens, options, env) {
		if (!tokens || tokens.length === 0) return "";
		const rules = this.rules;
		let result = "";
		for (let i = 0; i < tokens.length; i++) {
			const rule = rules[tokens[i].type];
			if (rule) result += await resolveResult(rule(tokens, i, options, env, this));
			else result += this.renderToken(tokens, i, options);
		}
		return result;
	}
	renderInlineAsTextInternal(tokens, options, env) {
		if (!tokens || tokens.length === 0) return "";
		let output = "";
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			switch (token.type) {
				case "text":
				case "text_special":
					output += token.content;
					break;
				case "image":
					output += this.renderInlineAsTextInternal(token.children || [], options, env);
					break;
				case "html_inline":
				case "html_block":
					output += token.content;
					break;
				case "softbreak":
				case "hardbreak":
					output += "\n";
					break;
				default: break;
			}
		}
		return output;
	}
};
var renderer_default = Renderer;
const EMPTY_TOKENS = [];
function makeEmptyStats() {
	return {
		total: 0,
		cacheHits: 0,
		appendHits: 0,
		unboundedAppendHits: 0,
		tailHits: 0,
		fullParses: 0,
		resets: 0,
		chunkedParses: 0,
		lastMode: "idle"
	};
}
var StreamParser = class {
	core;
	cache = null;
	stats = makeEmptyStats();
	MIN_SIZE_FOR_OPTIMIZATION = 1e3;
	DEFAULT_SKIP_CACHE_CHARS = 1e6;
	DEFAULT_SKIP_CACHE_LINES = 1e5;
	IMPLICIT_STREAM_CHUNK_MIN_CHARS = 16e4;
	MIN_LIST_LINES_FOR_MERGE = 80;
	MIN_LIST_CHARS_FOR_MERGE = 800;
	MIN_TABLE_LINES_FOR_MERGE = 48;
	MIN_TABLE_CHARS_FOR_MERGE = 1200;
	MIN_UNBOUNDED_APPEND_TOTAL_CHARS = 5e5;
	MIN_UNBOUNDED_APPEND_CHARS = 64e3;
	MIN_UNBOUNDED_APPEND_LINES = 700;
	constructor(core) {
		this.core = core;
	}
	reset() {
		this.cache = null;
		this.stats.resets += 1;
		this.stats.lastMode = "reset";
	}
	resetStats() {
		const { resets } = this.stats;
		this.stats = makeEmptyStats();
		this.stats.resets = resets;
	}
	parse(src, env, md) {
		const envProvided = env;
		const cached = this.cache;
		beginParseDiagnostics(envProvided ?? cached?.env);
		if (!cached || envProvided && envProvided !== cached.env) {
			const workingEnv = envProvided ?? {};
			const explicitChunkFallbackSetting$1 = !!md.__explicitStreamChunkFallbackSetting;
			const canImplicitLargeInput$1 = typeof md.__canUseImplicitLargeInputStrategy === "function" ? md.__canUseImplicitLargeInputStrategy() : true;
			const wantsChunking$1 = !!md.options?.streamChunkedFallback;
			const allowImplicitChunk$1 = !explicitChunkFallbackSetting$1 && canImplicitLargeInput$1;
			const chunkedEnabled$1 = wantsChunking$1 || allowImplicitChunk$1;
			const chunkAdaptive$1 = md.options?.streamChunkAdaptive !== false;
			const targetChunks$1 = md.options?.streamChunkTargetChunks ?? 8;
			const chunkSizeCharsCfg$1 = md.options?.streamChunkSizeChars;
			const chunkSizeLinesCfg$1 = md.options?.streamChunkSizeLines;
			const chunkMaxChunksCfg$1 = md.options?.streamChunkMaxChunks;
			const explicitChunkConfig$1 = !!md.__explicitStreamChunkConfig;
			const auto$1 = md.options?.autoTuneChunks !== false;
			const chunkFenceAware$1 = md.options?.streamChunkFenceAware ?? true;
			const skipCacheChars = md.options?.streamSkipCacheAboveChars ?? this.DEFAULT_SKIP_CACHE_CHARS;
			const skipCacheLines = md.options?.streamSkipCacheAboveLines ?? this.DEFAULT_SKIP_CACHE_LINES;
			let srcLineCount;
			let isVeryLargeOneShot = src.length >= skipCacheChars;
			if (!isVeryLargeOneShot && skipCacheLines !== void 0) {
				srcLineCount = countLines(src);
				isVeryLargeOneShot = srcLineCount >= skipCacheLines;
			}
			if (isVeryLargeOneShot) {
				const parsed$2 = this.parseFullDocument(src, workingEnv, md, srcLineCount, false);
				this.stats.total += 1;
				this.stats.fullParses += 1;
				this.stats.lastMode = "full";
				setStrategyDiagnostics(workingEnv, {
					area: "stream",
					path: "stream-full",
					reason: "skip-cache-large-one-shot",
					unbounded: !!getParseDiagnostics(workingEnv)?.unbounded
				});
				return parsed$2.tokens;
			} else if (chunkedEnabled$1) {
				const clamp$1 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
				if (srcLineCount === void 0) srcLineCount = countLines(src);
				const recommendation = auto$1 && !explicitChunkConfig$1 ? recommendStreamChunkStrategy(src.length, srcLineCount, md.options) : null;
				const useChars = recommendation?.maxChunkChars ?? (chunkAdaptive$1 ? clamp$1(Math.ceil(src.length / targetChunks$1), 8e3, 64e3) : chunkSizeCharsCfg$1 ?? 1e4);
				const useLines = recommendation?.maxChunkLines ?? (chunkAdaptive$1 ? clamp$1(Math.ceil(srcLineCount / targetChunks$1), 150, 700) : chunkSizeLinesCfg$1 ?? 200);
				const useMaxChunks = recommendation?.maxChunks ?? (chunkAdaptive$1 ? clamp$1(Math.ceil(src.length / 64e3), targetChunks$1, 32) : chunkMaxChunksCfg$1);
				const hasTrailingNewline = src.length > 0 && src.charCodeAt(src.length - 1) === 10;
				const shouldAutoChunk = allowImplicitChunk$1 && src.length >= this.IMPLICIT_STREAM_CHUNK_MIN_CHARS && recommendation?.strategy !== "plain";
				if ((wantsChunking$1 || shouldAutoChunk) && (src.length >= useChars * 2 || srcLineCount >= useLines * 2) && hasTrailingNewline) {
					const tokens = chunkedParse(md, src, workingEnv, {
						maxChunkChars: useChars,
						maxChunkLines: useLines,
						fenceAware: recommendation?.fenceAware ?? chunkFenceAware$1,
						maxChunks: useMaxChunks
					});
					this.cache = {
						src,
						tokens,
						env: workingEnv,
						lineCount: srcLineCount,
						lastSegment: void 0,
						globalStateReason: detectGlobalMarkdownState(src)
					};
					this.updateCacheLineCount(this.cache, srcLineCount);
					this.recordChunkedParseResult(workingEnv, wantsChunking$1 ? "explicit-initial-large-doc" : "default-initial-large-doc");
					return tokens;
				}
			}
			const parsed$1 = this.parseFullDocument(src, workingEnv, md, srcLineCount);
			srcLineCount = parsed$1.lineCount;
			this.cache = {
				src,
				tokens: parsed$1.tokens,
				env: workingEnv,
				lineCount: srcLineCount,
				lastSegment: void 0,
				globalStateReason: detectGlobalMarkdownState(src)
			};
			this.updateCacheLineCount(this.cache, srcLineCount);
			this.stats.total += 1;
			this.stats.fullParses += 1;
			this.stats.lastMode = "full";
			setStrategyDiagnostics(workingEnv, {
				area: "stream",
				path: "stream-full",
				reason: "initial-parse",
				unbounded: !!getParseDiagnostics(workingEnv)?.unbounded
			});
			return parsed$1.tokens;
		}
		if (src === cached.src) {
			this.stats.total += 1;
			this.stats.cacheHits += 1;
			this.stats.lastMode = "cache";
			setStrategyDiagnostics(cached.env, {
				area: "stream",
				path: "stream-cache",
				reason: "same-source"
			});
			return cached.tokens;
		}
		let cachedGlobalStateReason = cached.globalStateReason;
		if (cachedGlobalStateReason === void 0) {
			cachedGlobalStateReason = detectGlobalMarkdownState(cached.src);
			cached.globalStateReason = cachedGlobalStateReason;
		}
		const currentGlobalStateReason = detectGlobalMarkdownState(src);
		const nextGlobalStateReason = cachedGlobalStateReason || currentGlobalStateReason;
		if (nextGlobalStateReason) {
			const fallbackEnv$1 = envProvided ?? cached.env;
			resetKnownGlobalMarkdownState(fallbackEnv$1);
			const parsed$1 = this.parseFullDocument(src, fallbackEnv$1, md);
			const nextTokens$1 = parsed$1.tokens;
			const lineCount = parsed$1.lineCount;
			this.cache = {
				src,
				tokens: nextTokens$1,
				env: fallbackEnv$1,
				lineCount,
				lastSegment: void 0,
				globalStateReason: currentGlobalStateReason
			};
			this.updateCacheLineCount(this.cache, lineCount);
			this.stats.total += 1;
			this.stats.fullParses += 1;
			this.stats.lastMode = "full";
			setStrategyDiagnostics(fallbackEnv$1, {
				area: "stream",
				path: "stream-full",
				reason: `global-state:${nextGlobalStateReason}`,
				unbounded: !!getParseDiagnostics(fallbackEnv$1)?.unbounded
			});
			return nextTokens$1;
		}
		const threshold = md.options?.streamOptimizationMinSize ?? this.MIN_SIZE_FOR_OPTIMIZATION;
		if (cached.src.length < threshold && src.length < threshold * 1.5 && !src.startsWith(cached.src)) {
			const fallbackEnv$1 = envProvided ?? cached.env;
			const parsed$1 = this.parseFullDocument(src, fallbackEnv$1, md);
			const nextTokens$1 = parsed$1.tokens;
			const lineCount = parsed$1.lineCount;
			this.cache = {
				src,
				tokens: nextTokens$1,
				env: fallbackEnv$1,
				lineCount,
				lastSegment: void 0,
				globalStateReason: detectGlobalMarkdownState(src)
			};
			this.updateCacheLineCount(this.cache, lineCount);
			this.stats.total += 1;
			this.stats.fullParses += 1;
			this.stats.lastMode = "full";
			setStrategyDiagnostics(fallbackEnv$1, {
				area: "stream",
				path: "stream-full",
				reason: "small-non-append",
				unbounded: !!getParseDiagnostics(fallbackEnv$1)?.unbounded
			});
			return nextTokens$1;
		}
		const appended = this.getAppendedSegment(cached.src, src);
		if (appended && !this.shouldPreferTailReparseForAppend(cached)) {
			const cachedLineCount = cached.lineCount ?? countLines(cached.src);
			let ctxLines = 3;
			if (appended.length > 5e3) ctxLines = 8;
			else if (appended.length > 1e3) ctxLines = 6;
			else if (appended.length > 200) ctxLines = 4;
			ctxLines = Math.min(ctxLines, cachedLineCount);
			let appendedState = null;
			const ctxStrategy = md.options?.streamContextParseStrategy ?? "chars";
			const CONTEXT_PARSE_MIN_CHARS = md.options?.streamContextParseMinChars ?? 200;
			const CONTEXT_PARSE_MIN_LINES = md.options?.streamContextParseMinLines ?? 2;
			function appendedHasBlockConstructs(s) {
				const len = s.length;
				let lineStart = 0;
				while (lineStart <= len) {
					let lineEnd = s.indexOf("\n", lineStart);
					if (lineEnd === -1) lineEnd = len;
					const hasLineBreak = lineEnd < len;
					let p = lineStart;
					let indent = 0;
					while (p < lineEnd) {
						const c = s.charCodeAt(p);
						if (c === 32) {
							indent++;
							p++;
							if (indent >= 4) return true;
							continue;
						}
						if (c === 9) {
							indent += 4 - indent % 4;
							p++;
							if (indent >= 4) return true;
							continue;
						}
						break;
					}
					if (p < lineEnd) {
						const ch = s.charCodeAt(p);
						switch (ch) {
							case 35: {
								let q = p;
								while (q < lineEnd && s.charCodeAt(q) === 35) q++;
								const runLen = q - p;
								if (runLen > 0 && runLen <= 6) {
									if (q < lineEnd) {
										const next = s.charCodeAt(q);
										if (next === 32 || next === 9 || next === 13) return true;
									} else if (q === lineEnd && hasLineBreak) return true;
								}
								break;
							}
							case 62: {
								const nextPos = p + 1;
								if (nextPos < lineEnd) {
									const next = s.charCodeAt(nextPos);
									if (next === 32 || next === 9 || next === 13) return true;
								} else if (nextPos === lineEnd && hasLineBreak) return true;
								break;
							}
							case 45:
							case 42:
							case 43: {
								const nextPos = p + 1;
								if (nextPos < lineEnd) {
									const next = s.charCodeAt(nextPos);
									if (next === 32 || next === 9 || next === 13) return true;
								} else if (nextPos === lineEnd && hasLineBreak) return true;
								break;
							}
							case 96:
							case 126: {
								let q = p;
								while (q < lineEnd && s.charCodeAt(q) === ch) q++;
								if (q - p >= 3) return true;
								break;
							}
							default:
								if (ch >= 48 && ch <= 57) {
									let q = p + 1;
									while (q < lineEnd) {
										const d = s.charCodeAt(q);
										if (d < 48 || d > 57) break;
										q++;
									}
									if (q < lineEnd && s.charCodeAt(q) === 46) {
										const nextPos = q + 1;
										if (nextPos < lineEnd) {
											const next = s.charCodeAt(nextPos);
											if (next === 32 || next === 9 || next === 13) return true;
										} else if (nextPos === lineEnd && hasLineBreak) return true;
									}
								}
								break;
						}
					}
					if (lineEnd === len) break;
					lineStart = lineEnd + 1;
				}
				return false;
			}
			let appendedLineCount = null;
			const getAppendedLineCount = () => {
				if (appendedLineCount === null) appendedLineCount = countLines(appended);
				return appendedLineCount;
			};
			const canDirectParseAppend = this.canDirectlyParseAppend(cached);
			const useUnboundedAppend = canDirectParseAppend && this.shouldUseUnboundedAppend(src, cached, appended);
			let shouldAttemptContext = false;
			if (!canDirectParseAppend) switch (ctxStrategy) {
				case "lines":
					shouldAttemptContext = getAppendedLineCount() >= CONTEXT_PARSE_MIN_LINES;
					break;
				case "constructs":
					if (appended.length >= CONTEXT_PARSE_MIN_CHARS) {
						shouldAttemptContext = true;
						break;
					}
					if (appendedHasBlockConstructs(appended)) {
						shouldAttemptContext = true;
						break;
					}
					shouldAttemptContext = getAppendedLineCount() >= CONTEXT_PARSE_MIN_LINES;
					break;
				case "chars":
				default: shouldAttemptContext = appended.length >= CONTEXT_PARSE_MIN_CHARS;
			}
			if (ctxLines > 0 && shouldAttemptContext) {
				const ctxSrc = this.getTailLines(cached.src, ctxLines) + appended;
				try {
					const ctxTokens = this.core.parse(ctxSrc, cached.env, md).tokens;
					const idx = ctxTokens.findIndex((t) => t.map && typeof t.map[1] === "number" && t.map[1] > ctxLines);
					if (idx !== -1) {
						const appendedTokens = ctxTokens.slice(idx);
						const shiftBy = cachedLineCount - ctxLines;
						if (shiftBy !== 0) this.shiftTokenLines(appendedTokens, shiftBy);
						appendedState = { tokens: appendedTokens };
					}
				} catch {
					appendedState = null;
				}
			} else appendedState = null;
			if (!appendedState) {
				const lineOffset = cachedLineCount;
				if (useUnboundedAppend) {
					appendedState = { tokens: parseStringUnbounded(md, appended, cached.env, { mode: "stream" }) };
					if (lineOffset > 0) this.shiftTokenLines(appendedState.tokens, lineOffset);
				} else {
					const simpleState = this.core.parse(appended, cached.env, md);
					if (lineOffset > 0) this.shiftTokenLines(simpleState.tokens, lineOffset);
					appendedState = simpleState;
				}
			}
			if (cached.tokens.length > 0 && appendedState.tokens.length > 0) {
				const lastCached = cached.tokens[cached.tokens.length - 1];
				const firstApp = appendedState.tokens[0];
				try {
					if (lastCached.type === "inline" && firstApp.type === "inline") {
						if (firstApp.children && firstApp.children.length > 0) {
							if (!lastCached.children) lastCached.children = [];
							this.appendTokens(lastCached.children, firstApp.children);
						}
						lastCached.content = (lastCached.content || "") + (firstApp.content || "");
						appendedState.tokens.shift();
					}
				} catch {}
			}
			const appendStart = cached.tokens.length;
			if (appendedState.tokens.length > 0) {
				const cachedTail = cached.tokens;
				const a = appendedState.tokens;
				const maxCheck = Math.min(cachedTail.length, a.length);
				function attrsEqual(a$1, b) {
					if (!a$1 && !b) return true;
					if (!a$1 || !b || a$1.length !== b.length) return false;
					for (let i = 0; i < a$1.length; i++) if (a$1[i][0] !== b[i][0] || a$1[i][1] !== b[i][1]) return false;
					return true;
				}
				function childrenEqual(a$1, b) {
					if (!a$1 && !b) return true;
					if (!a$1 || !b || a$1.length !== b.length) return false;
					for (let i = 0; i < a$1.length; i++) if (!tokenEquals(a$1[i], b[i])) return false;
					return true;
				}
				function tokenEquals(x, y) {
					if (!x || !y) return false;
					if (x.type !== y.type) return false;
					const xMap = x.map;
					const yMap = y.map;
					if (!!xMap !== !!yMap) return false;
					if (xMap && yMap && (xMap[0] !== yMap[0] || xMap[1] !== yMap[1])) return false;
					if (x.tag !== y.tag || x.nesting !== y.nesting) return false;
					if (x.markup !== y.markup || x.info !== y.info) return false;
					if (x.block !== y.block || x.hidden !== y.hidden) return false;
					if (!attrsEqual(x.attrs, y.attrs)) return false;
					if (!childrenEqual(x.children, y.children)) return false;
					if (x.type === "inline") return (x.content || "") === (y.content || "");
					return (x.content || "") === (y.content || "");
				}
				let dup = 0;
				for (let n = maxCheck; n > 0; n--) {
					let ok = true;
					for (let i = 0; i < n; i++) {
						const tailToken = cachedTail[cachedTail.length - n + i];
						const prefToken = a[i];
						if (!tokenEquals(tailToken, prefToken)) {
							ok = false;
							break;
						}
					}
					if (ok) {
						dup = n;
						break;
					}
				}
				if (dup > 0) a.splice(0, dup);
				if (a.length > 0) this.appendTokens(cached.tokens, a);
			}
			cached.src = src;
			cached.globalStateReason = detectGlobalMarkdownState(src);
			cached.lineCount = cachedLineCount + (appendedLineCount ?? countLines(appended));
			if (cached.tokens.length > appendStart) {
				const appendedLastSegment = this.getLastSegment(cached.tokens.slice(appendStart), src);
				if (appendedLastSegment) cached.lastSegment = {
					tokenStart: appendStart + appendedLastSegment.tokenStart,
					tokenEnd: appendStart + appendedLastSegment.tokenEnd,
					lineStart: appendedLastSegment.lineStart,
					lineEnd: appendedLastSegment.lineEnd,
					srcOffset: appendedLastSegment.srcOffset
				};
				else cached.lastSegment = void 0;
			} else cached.lastSegment = void 0;
			this.stats.total += 1;
			this.stats.appendHits += 1;
			if (useUnboundedAppend) this.stats.unboundedAppendHits = (this.stats.unboundedAppendHits || 0) + 1;
			this.stats.lastMode = "append";
			setStrategyDiagnostics(cached.env, {
				area: "stream",
				path: useUnboundedAppend ? "stream-unbounded-append" : "stream-append",
				reason: useUnboundedAppend ? "large-delta" : "safe-append",
				unbounded: useUnboundedAppend
			});
			return cached.tokens;
		}
		const fallbackEnv = envProvided ?? cached.env;
		const tailReparsed = this.tryTailSegmentReparse(src, cached, fallbackEnv, md);
		if (tailReparsed) {
			this.stats.total += 1;
			this.stats.tailHits += 1;
			this.stats.lastMode = "tail";
			setStrategyDiagnostics(fallbackEnv, {
				area: "stream",
				path: "stream-tail",
				reason: "tail-reparse"
			});
			return tailReparsed;
		}
		const explicitChunkFallbackSetting = !!md.__explicitStreamChunkFallbackSetting;
		const canImplicitLargeInput = typeof md.__canUseImplicitLargeInputStrategy === "function" ? md.__canUseImplicitLargeInputStrategy() : true;
		const wantsChunking = !!md.options?.streamChunkedFallback;
		const allowImplicitChunk = !explicitChunkFallbackSetting && !appended && canImplicitLargeInput;
		const chunkedEnabled = wantsChunking || allowImplicitChunk;
		const chunkAdaptive = md.options?.streamChunkAdaptive !== false;
		const targetChunks = md.options?.streamChunkTargetChunks ?? 8;
		const chunkSizeCharsCfg = md.options?.streamChunkSizeChars;
		const chunkSizeLinesCfg = md.options?.streamChunkSizeLines;
		const chunkMaxChunksCfg = md.options?.streamChunkMaxChunks;
		const explicitChunkConfig = !!md.__explicitStreamChunkConfig;
		const auto = md.options?.autoTuneChunks !== false;
		const chunkFenceAware = md.options?.streamChunkFenceAware ?? true;
		let srcLineCount2 = appended && cached.lineCount !== void 0 ? cached.lineCount + countLines(appended) : void 0;
		if (chunkedEnabled) {
			if (srcLineCount2 === void 0) srcLineCount2 = countLines(src);
			const clamp$1 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
			const recommendation = auto && !explicitChunkConfig ? recommendStreamChunkStrategy(src.length, srcLineCount2, md.options) : null;
			const useChars = recommendation?.maxChunkChars ?? (chunkAdaptive ? clamp$1(Math.ceil(src.length / targetChunks), 8e3, 64e3) : chunkSizeCharsCfg ?? 1e4);
			const useLines = recommendation?.maxChunkLines ?? (chunkAdaptive ? clamp$1(Math.ceil(srcLineCount2 / targetChunks), 150, 700) : chunkSizeLinesCfg ?? 200);
			const useMaxChunks = recommendation?.maxChunks ?? (chunkAdaptive ? clamp$1(Math.ceil(src.length / 64e3), targetChunks, 32) : chunkMaxChunksCfg);
			const hasTrailingNewline2 = src.length > 0 && src.charCodeAt(src.length - 1) === 10;
			const shouldAutoChunk = allowImplicitChunk && src.length >= this.IMPLICIT_STREAM_CHUNK_MIN_CHARS && recommendation?.strategy !== "plain";
			if ((wantsChunking || shouldAutoChunk) && (src.length >= useChars * 2 || srcLineCount2 >= useLines * 2) && hasTrailingNewline2) {
				const tokens = chunkedParse(md, src, fallbackEnv, {
					maxChunkChars: useChars,
					maxChunkLines: useLines,
					fenceAware: recommendation?.fenceAware ?? chunkFenceAware,
					maxChunks: useMaxChunks
				});
				this.cache = {
					src,
					tokens,
					env: fallbackEnv,
					lineCount: srcLineCount2,
					lastSegment: void 0,
					globalStateReason: detectGlobalMarkdownState(src)
				};
				this.updateCacheLineCount(this.cache, srcLineCount2);
				this.recordChunkedParseResult(fallbackEnv, wantsChunking ? "explicit-fallback-large-doc" : "default-fallback-large-doc");
				return tokens;
			}
		}
		const parsed = this.parseFullDocument(src, fallbackEnv, md, srcLineCount2);
		const nextTokens = parsed.tokens;
		srcLineCount2 = parsed.lineCount;
		this.cache = {
			src,
			tokens: nextTokens,
			env: fallbackEnv,
			lineCount: srcLineCount2,
			lastSegment: void 0,
			globalStateReason: detectGlobalMarkdownState(src)
		};
		this.updateCacheLineCount(this.cache, srcLineCount2);
		this.stats.total += 1;
		this.stats.fullParses += 1;
		this.stats.lastMode = "full";
		setStrategyDiagnostics(fallbackEnv, {
			area: "stream",
			path: "stream-full",
			reason: "fallback-full",
			unbounded: !!getParseDiagnostics(fallbackEnv)?.unbounded
		});
		return nextTokens;
	}
	recordChunkedParseResult(env, chunkReason) {
		const chunkInfo = getParseDiagnostics(env)?.chunk;
		const fallbackReason = chunkInfo?.fallback ? String(chunkInfo.fallbackReason || "global-state") : null;
		this.stats.total += 1;
		if (fallbackReason) {
			this.stats.fullParses += 1;
			this.stats.lastMode = "full";
			setStrategyDiagnostics(env, {
				area: "stream",
				path: "stream-full",
				reason: `global-state:${fallbackReason}`,
				unbounded: !!getParseDiagnostics(env)?.unbounded
			});
			return;
		}
		this.stats.chunkedParses = (this.stats.chunkedParses || 0) + 1;
		this.stats.lastMode = "chunked";
		setStrategyDiagnostics(env, {
			area: "stream",
			path: "stream-chunked",
			chunked: true,
			reason: chunkReason
		});
	}
	parseFullDocument(src, env, md, knownLineCount, needLineCount = true) {
		const currentGlobalStateReason = detectGlobalMarkdownState(src);
		if (getKnownGlobalMarkdownState(env)) resetKnownGlobalMarkdownState(env);
		const autoUnboundedDecision = (typeof md.__canUseImplicitLargeInputStrategy === "function" ? md.__canUseImplicitLargeInputStrategy() : true) ? getAutoUnboundedDecision(md, src.length, knownLineCount) : "no";
		if (autoUnboundedDecision === "yes") {
			const tokens = parseStringUnbounded(md, src, env);
			setStrategyDiagnostics(env, {
				area: "stream",
				path: "stream-full",
				reason: "auto-unbounded-char-threshold",
				unbounded: true
			});
			return {
				tokens,
				lineCount: knownLineCount ?? (needLineCount ? countLines(src) : 0)
			};
		}
		let lineCount = knownLineCount;
		if (autoUnboundedDecision === "need-lines") {
			lineCount = countLines(src);
			if (shouldAutoUseUnbounded(md, src.length, lineCount)) {
				const tokens = parseStringUnbounded(md, src, env);
				setStrategyDiagnostics(env, {
					area: "stream",
					path: "stream-full",
					reason: "auto-unbounded-line-threshold",
					unbounded: true
				});
				return {
					tokens,
					lineCount
				};
			}
		}
		if (lineCount === void 0) lineCount = needLineCount ? countLines(src) : 0;
		return {
			tokens: runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
				return this.core.parse(src, env, md).tokens;
			}),
			lineCount
		};
	}
	shouldUseUnboundedAppend(src, _cached, appended) {
		if (!appended) return false;
		if (src.length < this.MIN_UNBOUNDED_APPEND_TOTAL_CHARS && appended.length < this.MIN_UNBOUNDED_APPEND_CHARS) return false;
		if (appended.length >= this.MIN_UNBOUNDED_APPEND_CHARS) return true;
		return countLines(appended) >= this.MIN_UNBOUNDED_APPEND_LINES;
	}
	getAppendedSegment(prev, next) {
		if (!next.startsWith(prev)) return null;
		if (!prev.endsWith("\n")) return null;
		const segment = next.slice(prev.length);
		if (!segment) return null;
		const segLen = segment.length;
		if (segment.charCodeAt(segLen - 1) !== 10) return null;
		let newlineCount = 0;
		let firstLineBreak = -1;
		for (let i = 0; i < segLen; i++) if (segment.charCodeAt(i) === 10) {
			if (firstLineBreak === -1) firstLineBreak = i;
			newlineCount++;
			if (newlineCount >= 2) break;
		}
		if (newlineCount < 2) return null;
		const trimmedFirstLine = (firstLineBreak === -1 ? segment : segment.slice(0, firstLineBreak)).trim();
		if (trimmedFirstLine.length === 0) return null;
		if (/^[-=]+$/.test(trimmedFirstLine)) {
			const prevWithoutTrailingNewline = prev.slice(0, -1);
			const lastBreak = prevWithoutTrailingNewline.lastIndexOf("\n");
			if (prevWithoutTrailingNewline.slice(lastBreak + 1).trim().length > 0) return null;
		}
		if (this.endsInsideOpenFence(prev)) return null;
		if (this.mayContainReferenceDefinition(segment)) return null;
		return segment;
	}
	tryTailSegmentReparse(src, cached, env, md) {
		const lastSegment = this.ensureLastSegment(cached);
		if (!lastSegment) return null;
		if (lastSegment.srcOffset <= 0 && lastSegment.tokenStart <= 0) return null;
		const stablePrefix = cached.src.slice(0, lastSegment.srcOffset);
		if (!src.startsWith(stablePrefix)) return null;
		const prevTail = cached.src.slice(lastSegment.srcOffset);
		const nextTail = src.slice(lastSegment.srcOffset);
		if (nextTail === prevTail) return null;
		const appended = src.startsWith(cached.src) ? src.slice(cached.src.length) : null;
		if (appended) {
			const merged = this.tryContainerTailAppendMerge(src, cached, env, md, lastSegment, appended);
			if (merged) return merged;
		}
		if (this.mayContainReferenceDefinition(prevTail) || this.mayContainReferenceDefinition(nextTail)) return null;
		try {
			const tailState = this.core.parse(nextTail, env, md);
			const localLastSegment = this.getLastSegment(tailState.tokens, nextTail);
			if (lastSegment.lineStart > 0) this.shiftTokenLines(tailState.tokens, lastSegment.lineStart);
			cached.src = src;
			cached.env = env;
			cached.globalStateReason = detectGlobalMarkdownState(src);
			cached.tokens.length = lastSegment.tokenStart;
			this.appendTokens(cached.tokens, tailState.tokens);
			cached.lineCount = countLines(src);
			if (localLastSegment) cached.lastSegment = {
				tokenStart: lastSegment.tokenStart + localLastSegment.tokenStart,
				tokenEnd: lastSegment.tokenStart + localLastSegment.tokenEnd,
				lineStart: lastSegment.lineStart + localLastSegment.lineStart,
				lineEnd: lastSegment.lineStart + localLastSegment.lineEnd,
				srcOffset: lastSegment.srcOffset + localLastSegment.srcOffset
			};
			else cached.lastSegment = null;
			return cached.tokens;
		} catch {
			return null;
		}
	}
	getTailLines(src, lineCount) {
		if (lineCount <= 0) return "";
		let remaining = lineCount;
		for (let i = src.length - 1; i >= 0; i--) if (src.charCodeAt(i) === 10) {
			remaining--;
			if (remaining === 0) return src.slice(i + 1);
		}
		return src;
	}
	endsInsideOpenFence(text$1) {
		const WINDOW = 4e3;
		const start = text$1.length > WINDOW ? text$1.length - WINDOW : 0;
		const chunk = text$1.slice(start);
		const len = chunk.length;
		let inFence = null;
		let lineStart = 0;
		while (lineStart <= len) {
			let lineEnd = chunk.indexOf("\n", lineStart);
			if (lineEnd === -1) lineEnd = len;
			let p = lineStart;
			while (p < lineEnd) {
				const c = chunk.charCodeAt(p);
				if (c === 32 || c === 9) p++;
				else break;
			}
			if (p < lineEnd) {
				const ch = chunk.charCodeAt(p);
				if (ch === 96 || ch === 126) {
					let q = p;
					while (q < lineEnd && chunk.charCodeAt(q) === ch) q++;
					const runLen = q - p;
					if (runLen >= 3) {
						if (!inFence) inFence = {
							marker: ch,
							length: runLen
						};
						else if (inFence.marker === ch && runLen >= inFence.length) inFence = null;
					}
				}
			}
			if (lineEnd === len) break;
			lineStart = lineEnd + 1;
		}
		return inFence !== null;
	}
	peek() {
		return this.cache?.tokens ?? EMPTY_TOKENS;
	}
	getStats() {
		return { ...this.stats };
	}
	appendTokens(target, source) {
		for (let i = 0; i < source.length; i++) target.push(source[i]);
	}
	updateCacheLineCount(cache, lineCount) {
		cache.lineCount = lineCount ?? countLines(cache.src);
		cache.lastSegment = void 0;
	}
	ensureLastSegment(cache) {
		if (cache.lastSegment !== void 0) return cache.lastSegment;
		cache.lastSegment = this.getLastSegment(cache.tokens, cache.src);
		return cache.lastSegment;
	}
	getLastSegment(tokens, src) {
		if (tokens.length === 0) return null;
		let lineStart = Number.POSITIVE_INFINITY;
		let lineEnd = -1;
		let depth = 0;
		for (let i = tokens.length - 1; i >= 0; i--) {
			const token = tokens[i];
			if (token.map) {
				if (token.map[0] < lineStart) lineStart = token.map[0];
				if (token.map[1] > lineEnd) lineEnd = token.map[1];
			}
			if (token.nesting < 0) {
				depth += -token.nesting;
				continue;
			}
			if (token.nesting > 0) {
				depth -= token.nesting;
				if (token.level === 0 && depth <= 0) {
					const resolvedStart = Number.isFinite(lineStart) ? lineStart : token.map?.[0] ?? 0;
					const resolvedEnd = lineEnd >= resolvedStart ? lineEnd : token.map?.[1] ?? resolvedStart;
					return {
						tokenStart: i,
						tokenEnd: tokens.length,
						lineStart: resolvedStart,
						lineEnd: resolvedEnd,
						srcOffset: this.getLineStartOffset(src, resolvedStart)
					};
				}
				continue;
			}
			if (token.level === 0 && depth === 0) {
				const resolvedStart = Number.isFinite(lineStart) ? lineStart : token.map?.[0] ?? 0;
				const resolvedEnd = lineEnd >= resolvedStart ? lineEnd : token.map?.[1] ?? resolvedStart;
				return {
					tokenStart: i,
					tokenEnd: tokens.length,
					lineStart: resolvedStart,
					lineEnd: resolvedEnd,
					srcOffset: this.getLineStartOffset(src, resolvedStart)
				};
			}
		}
		return null;
	}
	getLineStartOffset(src, line) {
		if (line <= 0) return 0;
		let remaining = line;
		let pos = -1;
		while (remaining > 0) {
			pos = src.indexOf("\n", pos + 1);
			if (pos === -1) return src.length;
			remaining--;
		}
		return pos + 1;
	}
	mayContainReferenceDefinition(src) {
		if (!src.includes("]:")) return false;
		return /(?:^|\n)[ \t]{0,3}\[[^\]\n]+\]:/.test(src);
	}
	canDirectlyParseAppend(cache) {
		if (!this.endsWithBlankLine(cache.src)) return false;
		const lastSegment = this.ensureLastSegment(cache);
		if (!lastSegment) return false;
		switch (cache.tokens[lastSegment.tokenStart]?.type) {
			case "paragraph_open":
			case "heading_open":
			case "fence":
			case "code_block":
			case "html_block":
			case "hr":
			case "table_open": return true;
			default: return false;
		}
	}
	tryContainerTailAppendMerge(src, cached, env, md, lastSegment, appended) {
		if (!appended || this.mayContainReferenceDefinition(appended)) return null;
		const lastToken = cached.tokens[lastSegment.tokenStart];
		switch (lastToken?.type) {
			case "bullet_list_open":
			case "ordered_list_open": return this.tryListTailAppendMerge(src, cached, env, md, lastSegment, appended, lastToken);
			case "table_open": return this.tryTableTailAppendMerge(src, cached, env, md, lastSegment, appended, lastToken);
			default: return null;
		}
	}
	tryListTailAppendMerge(src, cached, env, md, lastSegment, appended, listOpen) {
		if (cached.src.length === 0 || cached.src.charCodeAt(cached.src.length - 1) !== 10) return null;
		const segmentLineSpan = lastSegment.lineEnd - lastSegment.lineStart;
		const segmentChars = cached.src.length - lastSegment.srcOffset;
		if (segmentLineSpan < this.MIN_LIST_LINES_FOR_MERGE && segmentChars < this.MIN_LIST_CHARS_FOR_MERGE) return null;
		const closeType = listOpen.type === "bullet_list_open" ? "bullet_list_close" : "ordered_list_close";
		let parsed;
		try {
			parsed = this.core.parse(appended, env, md).tokens;
		} catch {
			return null;
		}
		if (!this.isSingleTopLevelContainer(parsed, listOpen.type, closeType, listOpen.markup)) return null;
		const inserted = parsed.slice(1, -1);
		if (inserted.length === 0) return null;
		const lineOffset = cached.lineCount ?? countLines(cached.src);
		if (lineOffset > 0) this.shiftTokenLines(inserted, lineOffset);
		const existingMode = this.getListParagraphMode(cached.tokens, lastSegment.tokenStart, cached.tokens.length, listOpen.level);
		const appendedMode = this.getListParagraphMode(parsed, 0, parsed.length, 0);
		if (existingMode === "loose" || appendedMode === "loose" || this.endsWithBlankLine(cached.src) || (parsed[0]?.map?.[0] ?? 0) > 0) {
			this.setListParagraphVisibility(cached.tokens, lastSegment.tokenStart, cached.tokens.length, listOpen.level, false);
			this.setListParagraphVisibility(inserted, 0, inserted.length, listOpen.level, false);
		}
		cached.tokens.splice(cached.tokens.length - 1, 0, ...inserted);
		cached.src = src;
		cached.env = env;
		cached.globalStateReason = detectGlobalMarkdownState(src);
		cached.lineCount = countLines(src);
		if (listOpen.map) listOpen.map[1] = this.getDocLineCount(src);
		cached.lastSegment = {
			tokenStart: lastSegment.tokenStart,
			tokenEnd: cached.tokens.length,
			lineStart: lastSegment.lineStart,
			lineEnd: this.getDocLineCount(src),
			srcOffset: lastSegment.srcOffset
		};
		return cached.tokens;
	}
	tryTableTailAppendMerge(src, cached, env, md, lastSegment, appended, tableOpen) {
		if (cached.src.length === 0 || cached.src.charCodeAt(cached.src.length - 1) !== 10) return null;
		if (/(?:^|\n)[ \t]*\n/.test(appended)) return null;
		const segmentLineSpan = lastSegment.lineEnd - lastSegment.lineStart;
		const segmentChars = cached.src.length - lastSegment.srcOffset;
		if (segmentLineSpan < this.MIN_TABLE_LINES_FOR_MERGE && segmentChars < this.MIN_TABLE_CHARS_FOR_MERGE) return null;
		const tableContext = this.getTableHeaderContext(cached.src.slice(lastSegment.srcOffset));
		if (!tableContext) return null;
		const syntheticSrc = `${tableContext}${appended}`;
		let parsed;
		try {
			parsed = this.core.parse(syntheticSrc, env, md).tokens;
		} catch {
			return null;
		}
		if (!this.isSingleTopLevelContainer(parsed, "table_open", "table_close")) return null;
		if ((parsed[0]?.map?.[1] ?? -1) !== this.getDocLineCount(syntheticSrc)) return null;
		const parsedSection = this.getTableBodySection(parsed, 0, parsed.length, 0);
		const cachedSection = this.getTableBodySection(cached.tokens, lastSegment.tokenStart, cached.tokens.length, tableOpen.level);
		if (!parsedSection || !cachedSection || parsedSection.tbodyOpenIndex < 0 || parsedSection.tbodyCloseIndex < 0) return null;
		const inserted = cachedSection.tbodyOpenIndex >= 0 ? parsed.slice(parsedSection.tbodyOpenIndex + 1, parsedSection.tbodyCloseIndex) : parsed.slice(parsedSection.tbodyOpenIndex, parsedSection.tbodyCloseIndex + 1);
		if (inserted.length === 0) return null;
		const lineOffset = lastSegment.lineEnd - 2;
		if (lineOffset !== 0) this.shiftTokenLines(inserted, lineOffset);
		const insertAt = cachedSection.tbodyCloseIndex >= 0 ? cachedSection.tbodyCloseIndex : cachedSection.tableCloseIndex;
		cached.tokens.splice(insertAt, 0, ...inserted);
		cached.src = src;
		cached.env = env;
		cached.globalStateReason = detectGlobalMarkdownState(src);
		cached.lineCount = countLines(src);
		const nextDocLineCount = this.getDocLineCount(src);
		if (tableOpen.map) tableOpen.map[1] = nextDocLineCount;
		if (cachedSection.tbodyOpenIndex >= 0) {
			const tbodyOpen = cached.tokens[cachedSection.tbodyOpenIndex];
			if (tbodyOpen?.map) tbodyOpen.map[1] = nextDocLineCount;
		}
		cached.lastSegment = {
			tokenStart: lastSegment.tokenStart,
			tokenEnd: cached.tokens.length,
			lineStart: lastSegment.lineStart,
			lineEnd: nextDocLineCount,
			srcOffset: lastSegment.srcOffset
		};
		return cached.tokens;
	}
	getTableHeaderContext(src) {
		const firstBreak = src.indexOf("\n");
		if (firstBreak < 0) return null;
		const secondBreak = src.indexOf("\n", firstBreak + 1);
		if (secondBreak < 0) return null;
		return src.slice(0, secondBreak + 1);
	}
	getTableBodySection(tokens, start, end, tableLevel) {
		if (start < 0 || start >= end || tokens[start]?.type !== "table_open") return null;
		let tableCloseIndex = -1;
		for (let i = end - 1; i > start; i--) {
			const token = tokens[i];
			if (token.type === "table_close" && token.level === tableLevel) {
				tableCloseIndex = i;
				break;
			}
		}
		if (tableCloseIndex < 0) return null;
		let tbodyOpenIndex = -1;
		let tbodyCloseIndex = -1;
		for (let i = start + 1; i < tableCloseIndex; i++) {
			const token = tokens[i];
			if (token.type === "tbody_open" && token.level === tableLevel + 1) {
				tbodyOpenIndex = i;
				break;
			}
		}
		if (tbodyOpenIndex >= 0) {
			for (let i = tableCloseIndex - 1; i > tbodyOpenIndex; i--) {
				const token = tokens[i];
				if (token.type === "tbody_close" && token.level === tableLevel + 1) {
					tbodyCloseIndex = i;
					break;
				}
			}
			if (tbodyCloseIndex < 0) return null;
		}
		return {
			tableCloseIndex,
			tbodyOpenIndex,
			tbodyCloseIndex
		};
	}
	isSingleTopLevelContainer(tokens, openType, closeType, markup) {
		if (tokens.length < 2) return false;
		const first = tokens[0];
		const last = tokens[tokens.length - 1];
		if (first.type !== openType || last.type !== closeType || first.level !== 0 || last.level !== 0) return false;
		if (markup !== void 0 && first.markup !== markup) return false;
		let depth = 0;
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.level === 0 && i > 0 && i < tokens.length - 1 && depth === 0) return false;
			if (token.nesting > 0) depth += token.nesting;
			else if (token.nesting < 0) depth += token.nesting;
		}
		return depth === 0;
	}
	getListParagraphMode(tokens, start, end, listLevel) {
		let sawHidden = false;
		let sawVisible = false;
		const paragraphLevel = listLevel + 2;
		for (let i = start; i < end; i++) {
			const token = tokens[i];
			if (token.type !== "paragraph_open" || token.level !== paragraphLevel) continue;
			if (token.hidden) sawHidden = true;
			else sawVisible = true;
			if (sawHidden && sawVisible) return "loose";
		}
		if (sawVisible) return "loose";
		if (sawHidden) return "tight";
		return "none";
	}
	setListParagraphVisibility(tokens, start, end, listLevel, hidden) {
		const paragraphLevel = listLevel + 2;
		for (let i = start; i < end; i++) {
			const token = tokens[i];
			if ((token.type === "paragraph_open" || token.type === "paragraph_close") && token.level === paragraphLevel) token.hidden = hidden;
		}
	}
	shouldPreferTailReparseForAppend(cache) {
		const lastSegment = this.ensureLastSegment(cache);
		if (!lastSegment) return false;
		switch (cache.tokens[lastSegment.tokenStart]?.type) {
			case "bullet_list_open":
			case "ordered_list_open":
			case "blockquote_open":
			case "table_open": return true;
			case "paragraph_open":
			case "code_block":
			case "html_block": return !this.endsWithBlankLine(cache.src);
			default: return false;
		}
	}
	endsWithBlankLine(src) {
		const len = src.length;
		if (len < 2 || src.charCodeAt(len - 1) !== 10) return false;
		let pos = len - 2;
		while (pos >= 0) {
			const ch = src.charCodeAt(pos);
			if (ch === 32 || ch === 9) {
				pos--;
				continue;
			}
			return ch === 10;
		}
		return true;
	}
	getDocLineCount(src) {
		const lines = countLines(src);
		if (src.length === 0) return 0;
		return src.charCodeAt(src.length - 1) === 10 ? lines : lines + 1;
	}
	shiftTokenLines(tokens, offset) {
		if (offset === 0) return;
		const stack = [...tokens];
		while (stack.length > 0) {
			const token = stack.pop();
			if (token.map) {
				token.map[0] += offset;
				token.map[1] += offset;
			}
			if (token.children) for (let i = token.children.length - 1; i >= 0; i--) stack.push(token.children[i]);
		}
	}
};
const config = {
	default: default_default,
	zero: zero_default,
	commonmark: commonmark_default
};
function getParserRuleVersions(md) {
	return {
		core: md.core.ruler.version,
		block: md.block.ruler.version,
		inline: md.inline.ruler.version,
		inline2: md.inline.ruler2.version
	};
}
function hasParserRuleChanges(md, initial) {
	return md.core.ruler.version !== initial.core || md.block.ruler.version !== initial.block || md.inline.ruler.version !== initial.inline || md.inline.ruler2.version !== initial.inline2;
}
function applyExperimentalOptions(options) {
	return options.experimental ? {
		...options,
		...options.experimental
	} : options;
}
function hasOwnOption(obj, key) {
	if (!obj) return false;
	if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== void 0) return true;
	const experimental = obj.experimental;
	return !!experimental && Object.prototype.hasOwnProperty.call(experimental, key) && experimental[key] !== void 0;
}
function hasExplicitChunkOverride(presetOptions, userOptions, keys) {
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (hasOwnOption(userOptions, key) || hasOwnOption(presetOptions, key)) return true;
	}
	return false;
}
function hasExplicitOption(presetOptions, userOptions, key) {
	return hasOwnOption(userOptions, key) || hasOwnOption(presetOptions, key);
}
function setFullChunkStrategyDiagnostics(env, reason) {
	const chunkInfo = getParseDiagnostics(env)?.chunk;
	if (chunkInfo?.fallback) {
		setStrategyDiagnostics(env, {
			area: "parse",
			path: "plain",
			reason: `global-state:${chunkInfo.fallbackReason || "unknown"}`
		});
		return;
	}
	setStrategyDiagnostics(env, {
		area: "parse",
		path: "full-chunk",
		chunked: true,
		reason
	});
}
function markdownIt(presetName, options) {
	let opts = {
		html: false,
		xhtmlOut: false,
		breaks: false,
		langPrefix: "language-",
		linkify: false,
		typographer: false,
		quotes: "“”‘’",
		highlight: null,
		maxNesting: 100,
		stream: false,
		streamOptimizationMinSize: 1e3,
		streamChunkedFallback: false,
		streamChunkSizeChars: 1e4,
		streamChunkSizeLines: 200,
		streamChunkFenceAware: true,
		streamChunkAdaptive: true,
		streamChunkTargetChunks: 8,
		streamChunkMaxChunks: void 0,
		streamSkipCacheAboveChars: 1e6,
		streamSkipCacheAboveLines: 1e5,
		fullChunkedFallback: false,
		fullChunkThresholdChars: 2e4,
		fullChunkThresholdLines: 400,
		fullChunkSizeChars: 1e4,
		fullChunkSizeLines: 200,
		fullChunkFenceAware: true,
		fullChunkAdaptive: true,
		fullChunkTargetChunks: 8,
		fullChunkMaxChunks: void 0,
		autoTuneChunks: true,
		autoUnbounded: true,
		autoUnboundedThresholdChars: 4e6,
		autoUnboundedThresholdLines: 8e4
	};
	let presetToUse = "default";
	let userOptions;
	if (!options && typeof presetName !== "string") {
		userOptions = presetName;
		presetToUse = "default";
	} else if (typeof presetName === "string") {
		presetToUse = presetName;
		userOptions = options;
	}
	const preset = config[presetToUse];
	if (!preset) throw new Error(`Wrong \`markdown-it\` preset "${presetToUse}", check name`);
	if (preset?.options) opts = {
		...opts,
		...preset.options
	};
	if (userOptions) opts = {
		...opts,
		...userOptions
	};
	opts = applyExperimentalOptions(opts);
	if (typeof opts.quotes === "string") {
		const quotesStr = opts.quotes;
		if (quotesStr.length >= 4) opts.quotes = [
			quotesStr[0],
			quotesStr[1],
			quotesStr[2],
			quotesStr[3]
		];
		else opts.quotes = [
			"“",
			"”",
			"‘",
			"’"
		];
	}
	let explicitFullChunkConfig = hasExplicitChunkOverride(preset?.options, userOptions, [
		"fullChunkSizeChars",
		"fullChunkSizeLines",
		"fullChunkMaxChunks"
	]);
	let explicitStreamChunkConfig = hasExplicitChunkOverride(preset?.options, userOptions, [
		"streamChunkSizeChars",
		"streamChunkSizeLines",
		"streamChunkMaxChunks"
	]);
	let explicitFullChunkFallbackSetting = hasExplicitOption(preset?.options, userOptions, "fullChunkedFallback");
	let explicitStreamChunkFallbackSetting = hasExplicitOption(preset?.options, userOptions, "streamChunkedFallback");
	let usedPlugin = false;
	let initialParserRuleVersions = null;
	const core = new ParserCore();
	let renderer = null;
	const getRenderer = () => {
		if (!renderer) renderer = new renderer_default(opts);
		return renderer;
	};
	let streamParser = null;
	const getStreamParser = () => {
		if (!streamParser) streamParser = new StreamParser(core);
		return streamParser;
	};
	let linkifyInstance = null;
	const getLinkify = () => {
		if (!linkifyInstance) linkifyInstance = new linkify_it_default();
		return linkifyInstance;
	};
	const canUseImplicitLargeInputStrategy = (instance) => {
		return !usedPlugin && !!initialParserRuleVersions && !hasParserRuleChanges(instance, initialParserRuleVersions);
	};
	const md = {
		core,
		block: core.block,
		inline: core.inline,
		get linkify() {
			const inst = getLinkify();
			Object.defineProperty(this, "linkify", {
				value: inst,
				writable: true,
				configurable: true
			});
			return inst;
		},
		get renderer() {
			const r = getRenderer();
			Object.defineProperty(this, "renderer", {
				value: r,
				writable: true,
				configurable: true
			});
			return r;
		},
		options: opts,
		__explicitFullChunkConfig: explicitFullChunkConfig,
		__explicitStreamChunkConfig: explicitStreamChunkConfig,
		__explicitFullChunkFallbackSetting: explicitFullChunkFallbackSetting,
		__explicitStreamChunkFallbackSetting: explicitStreamChunkFallbackSetting,
		__canUseImplicitLargeInputStrategy() {
			return canUseImplicitLargeInputStrategy(this);
		},
		set(newOpts) {
			const resolvedNewOpts = applyExperimentalOptions(newOpts);
			this.options = {
				...this.options,
				...resolvedNewOpts
			};
			if (hasOwnOption(newOpts, "fullChunkSizeChars") || hasOwnOption(newOpts, "fullChunkSizeLines") || hasOwnOption(newOpts, "fullChunkMaxChunks")) {
				explicitFullChunkConfig = true;
				this.__explicitFullChunkConfig = true;
			}
			if (hasOwnOption(newOpts, "streamChunkSizeChars") || hasOwnOption(newOpts, "streamChunkSizeLines") || hasOwnOption(newOpts, "streamChunkMaxChunks")) {
				explicitStreamChunkConfig = true;
				this.__explicitStreamChunkConfig = true;
			}
			if (hasOwnOption(newOpts, "fullChunkedFallback")) {
				explicitFullChunkFallbackSetting = true;
				this.__explicitFullChunkFallbackSetting = true;
			}
			if (hasOwnOption(newOpts, "streamChunkedFallback")) {
				explicitStreamChunkFallbackSetting = true;
				this.__explicitStreamChunkFallbackSetting = true;
			}
			if (renderer) renderer.set(resolvedNewOpts);
			if (typeof resolvedNewOpts.stream === "boolean") {
				this.stream.enabled = resolvedNewOpts.stream;
				if (streamParser) {
					streamParser.reset();
					streamParser.resetStats();
				}
			}
			return this;
		},
		configure(presets) {
			const p = typeof presets === "string" ? config[presets] : presets;
			if (!p) throw new Error("Wrong `markdown-it` preset, can't be empty");
			if (p.options) this.set(p.options);
			if (p.components) {
				const c = p.components;
				if (c.core?.rules) this.core.ruler.enableOnly(c.core.rules);
				if (c.block?.rules) this.block.ruler.enableOnly(c.block.rules);
				if (c.inline?.rules) this.inline.ruler.enableOnly(c.inline.rules);
				if (c.inline2?.rules) this.inline.ruler2.enableOnly(c.inline2.rules);
			}
			return this;
		},
		enable(list$1, ignoreInvalid) {
			const names = Array.isArray(list$1) ? list$1 : [list$1];
			const managers = [
				this.core?.ruler,
				this.block?.ruler,
				this.inline?.ruler,
				this.inline?.ruler2
			];
			const found = /* @__PURE__ */ new Set();
			for (const m of managers) {
				if (!m) continue;
				const enabled = m.enable(names, true);
				for (let i = 0; i < enabled.length; i++) found.add(enabled[i]);
			}
			if (!ignoreInvalid) {
				const missed = names.filter((name) => !found.has(name));
				if (missed.length) throw new Error(`Rules manager: invalid rule name ${missed.join(", ")}`);
			}
			return this;
		},
		disable(list$1, ignoreInvalid) {
			const names = Array.isArray(list$1) ? list$1 : [list$1];
			const managers = [
				this.core?.ruler,
				this.block?.ruler,
				this.inline?.ruler,
				this.inline?.ruler2
			];
			const found = /* @__PURE__ */ new Set();
			for (const m of managers) {
				if (!m) continue;
				const disabled = m.disable(names, true);
				for (let i = 0; i < disabled.length; i++) found.add(disabled[i]);
			}
			if (!ignoreInvalid) {
				const missed = names.filter((name) => !found.has(name));
				if (missed.length) throw new Error(`Rules manager: invalid rule name ${missed.join(", ")}`);
			}
			return this;
		},
		use(plugin, ...params) {
			const fn = typeof plugin === "function" ? plugin : plugin && typeof plugin.default === "function" ? plugin.default : void 0;
			if (!fn) throw new TypeError("MarkdownIt.use: plugin must be a function");
			const args = [this, ...params];
			const thisArg = typeof plugin === "function" ? plugin : plugin;
			usedPlugin = true;
			fn.apply(thisArg, args);
			return this;
		},
		render(src, env = {}) {
			const tokens = this.parse(src, env);
			return getRenderer().render(tokens, this.options, env);
		},
		async renderAsync(src, env = {}) {
			const tokens = this.parse(src, env);
			return getRenderer().renderAsync(tokens, this.options, env);
		},
		renderIterable(chunks, env = {}) {
			const tokens = this.parseIterable(chunks, env);
			return getRenderer().render(tokens, this.options, env);
		},
		async renderAsyncIterable(chunks, env = {}) {
			const tokens = await this.parseAsyncIterable(chunks, env);
			return getRenderer().renderAsync(tokens, this.options, env);
		},
		renderInline(src, env = {}) {
			const tokens = this.parseInline(src, env);
			return getRenderer().render(tokens, this.options, env);
		},
		validateLink,
		normalizeLink,
		normalizeLinkText,
		utils: utils_exports,
		helpers: { ...helpers_exports },
		parse(src, env = {}) {
			if (typeof src !== "string") throw new TypeError("Input data should be a String");
			beginParseDiagnostics(env);
			let countedLines;
			if (!this.stream.enabled && !this.options.fullChunkedFallback) {
				if (canUseImplicitLargeInputStrategy(this)) {
					const autoUnboundedDecision = getAutoUnboundedDecision(this, src.length);
					if (autoUnboundedDecision === "yes") {
						const tokens = parseStringUnbounded(this, src, env);
						setStrategyDiagnostics(env, {
							area: "parse",
							path: "auto-unbounded",
							unbounded: true,
							reason: "char-threshold"
						});
						return tokens;
					}
					if (autoUnboundedDecision === "need-lines") countedLines = countLines(src);
				}
			}
			if (!this.stream.enabled) {
				const chars = src.length;
				const lines = countedLines ?? countLines(src);
				const auto = this.options.autoTuneChunks !== false;
				const userForcedChunk = explicitFullChunkConfig;
				const allowImplicitChunk = !explicitFullChunkFallbackSetting && canUseImplicitLargeInputStrategy(this);
				const wantsChunking = !!this.options.fullChunkedFallback;
				const shouldAutoChunk = allowImplicitChunk && chars >= 2e5;
				const autoRecommendation = auto && !userForcedChunk ? recommendFullChunkStrategy(chars, lines, this.options) : null;
				if (wantsChunking || shouldAutoChunk) {
					if (wantsChunking ? chars >= (this.options.fullChunkThresholdChars ?? 2e4) || lines >= (this.options.fullChunkThresholdLines ?? 400) : shouldAutoChunk) {
						if (autoRecommendation && autoRecommendation.strategy !== "plain") {
							const tokens = chunkedParse(this, src, env, {
								maxChunkChars: autoRecommendation.maxChunkChars,
								maxChunkLines: autoRecommendation.maxChunkLines,
								fenceAware: autoRecommendation.fenceAware,
								maxChunks: autoRecommendation.maxChunks
							});
							setFullChunkStrategyDiagnostics(env, wantsChunking ? "explicit-full-chunk" : "default-large-string");
							return tokens;
						}
						if (wantsChunking) {
							const clamp$1 = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
							const adaptive = this.options.fullChunkAdaptive !== false;
							const target = this.options.fullChunkTargetChunks ?? 8;
							const dynMaxChunkChars = clamp$1(Math.ceil(chars / target), 8e3, 64e3);
							const dynMaxChunkLines = clamp$1(Math.ceil(lines / target), 150, 700);
							const maxChunkChars = adaptive ? dynMaxChunkChars : this.options.fullChunkSizeChars ?? 1e4;
							const maxChunkLines = adaptive ? dynMaxChunkLines : this.options.fullChunkSizeLines ?? 200;
							const maxChunks = adaptive ? clamp$1(Math.ceil(chars / 64e3), target, 32) : this.options.fullChunkMaxChunks;
							const tokens = chunkedParse(this, src, env, {
								maxChunkChars,
								maxChunkLines,
								fenceAware: this.options.fullChunkFenceAware ?? true,
								maxChunks
							});
							setFullChunkStrategyDiagnostics(env, "explicit-full-chunk");
							return tokens;
						}
					}
				}
				if (countedLines !== void 0 && canUseImplicitLargeInputStrategy(this) && shouldAutoUseUnbounded(this, chars, lines)) {
					const tokens = parseStringUnbounded(this, src, env);
					setStrategyDiagnostics(env, {
						area: "parse",
						path: "auto-unbounded",
						unbounded: true,
						reason: "line-threshold"
					});
					return tokens;
				}
			}
			const currentGlobalStateReason = detectGlobalMarkdownState(src);
			setStrategyDiagnostics(env, {
				area: "parse",
				path: "plain",
				reason: "default-plain"
			});
			return runWithKnownGlobalMarkdownState(env, currentGlobalStateReason, () => {
				return core.parse(src, env, this).tokens;
			});
		},
		parseIterable(chunks, env = {}) {
			beginParseDiagnostics(env);
			return parseIterable(this, chunks, env);
		},
		parseAsyncIterable(chunks, env = {}) {
			beginParseDiagnostics(env);
			return parseAsyncIterable(this, chunks, env);
		},
		parseIterableToSink(chunks, onChunkTokens, env = {}) {
			beginParseDiagnostics(env);
			return parseIterableToSink(this, chunks, onChunkTokens, env);
		},
		parseAsyncIterableToSink(chunks, onChunkTokens, env = {}) {
			beginParseDiagnostics(env);
			return parseAsyncIterableToSink(this, chunks, onChunkTokens, env);
		},
		parseInline(src, env = {}) {
			if (typeof src !== "string") throw new TypeError("Input data should be a String");
			beginParseDiagnostics(env);
			if (getKnownGlobalMarkdownState(env)) resetKnownGlobalMarkdownState(env);
			const state = core.createState(src, env, this);
			state.inlineMode = true;
			core.process(state);
			return state.tokens;
		}
	};
	md.stream = {
		enabled: Boolean(opts.stream),
		parse(src, env) {
			if (!md.stream.enabled) return md.parse(src, env ?? {});
			return getStreamParser().parse(src, env, md);
		},
		reset() {
			getStreamParser().reset();
		},
		peek() {
			return streamParser ? streamParser.peek() : [];
		},
		stats() {
			return streamParser ? streamParser.getStats() : {
				total: 0,
				cacheHits: 0,
				appendHits: 0,
				unboundedAppendHits: 0,
				tailHits: 0,
				fullParses: 0,
				resets: 0,
				chunkedParses: 0,
				lastMode: "idle"
			};
		},
		resetStats() {
			if (streamParser) streamParser.resetStats();
		}
	};
	if (preset?.components) {
		const c = preset.components;
		if (c.core?.rules) md.core.ruler.enableOnly(c.core.rules);
		if (c.block?.rules) md.block.ruler.enableOnly(c.block.rules);
		if (c.inline?.rules) md.inline.ruler.enableOnly(c.inline.rules);
		if (c.inline2?.rules) md.inline.ruler2.enableOnly(c.inline2.rules);
	}
	initialParserRuleVersions = getParserRuleVersions(md);
	return md;
}
var src_default = markdownIt;

//#endregion
//#region src/config.ts
let defaultMathOptions;
function setDefaultMathOptions(opts) {
	defaultMathOptions = opts;
}
function getDefaultMathOptions() {
	return defaultMathOptions;
}

//#endregion
//#region ../../node_modules/.pnpm/markdown-it-container@4.0.0/node_modules/markdown-it-container/index.mjs
function container_plugin(md, name, options) {
	function validateDefault(params) {
		return params.trim().split(" ", 2)[0] === name;
	}
	function renderDefault(tokens, idx, _options, env, slf) {
		if (tokens[idx].nesting === 1) tokens[idx].attrJoin("class", name);
		return slf.renderToken(tokens, idx, _options, env, slf);
	}
	options = options || {};
	const min_markers = 3;
	const marker_str = options.marker || ":";
	const marker_char = marker_str.charCodeAt(0);
	const marker_len = marker_str.length;
	const validate = options.validate || validateDefault;
	const render = options.render || renderDefault;
	function container(state, startLine, endLine, silent) {
		let pos;
		let auto_closed = false;
		let start = state.bMarks[startLine] + state.tShift[startLine];
		let max = state.eMarks[startLine];
		if (marker_char !== state.src.charCodeAt(start)) return false;
		for (pos = start + 1; pos <= max; pos++) if (marker_str[(pos - start) % marker_len] !== state.src[pos]) break;
		const marker_count = Math.floor((pos - start) / marker_len);
		if (marker_count < min_markers) return false;
		pos -= (pos - start) % marker_len;
		const markup = state.src.slice(start, pos);
		const params = state.src.slice(pos, max);
		if (!validate(params, markup)) return false;
		if (silent) return true;
		let nextLine = startLine;
		for (;;) {
			nextLine++;
			if (nextLine >= endLine) break;
			start = state.bMarks[nextLine] + state.tShift[nextLine];
			max = state.eMarks[nextLine];
			if (start < max && state.sCount[nextLine] < state.blkIndent) break;
			if (marker_char !== state.src.charCodeAt(start)) continue;
			if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
			for (pos = start + 1; pos <= max; pos++) if (marker_str[(pos - start) % marker_len] !== state.src[pos]) break;
			if (Math.floor((pos - start) / marker_len) < marker_count) continue;
			pos -= (pos - start) % marker_len;
			pos = state.skipSpaces(pos);
			if (pos < max) continue;
			auto_closed = true;
			break;
		}
		const old_parent = state.parentType;
		const old_line_max = state.lineMax;
		state.parentType = "container";
		state.lineMax = nextLine;
		const token_o = state.push("container_" + name + "_open", "div", 1);
		token_o.markup = markup;
		token_o.block = true;
		token_o.info = params;
		token_o.map = [startLine, nextLine];
		state.md.block.tokenize(state, startLine + 1, nextLine);
		const token_c = state.push("container_" + name + "_close", "div", -1);
		token_c.markup = state.src.slice(start, pos);
		token_c.block = true;
		state.parentType = old_parent;
		state.lineMax = old_line_max;
		state.line = nextLine + (auto_closed ? 1 : 0);
		return true;
	}
	md.block.ruler.before("fence", "container_" + name, container, { alt: [
		"paragraph",
		"reference",
		"blockquote",
		"list"
	] });
	md.renderer.rules["container_" + name + "_open"] = render;
	md.renderer.rules["container_" + name + "_close"] = render;
}

//#endregion
//#region src/plugins/containers.ts
function parseLooseInlineAttrs(input) {
	const s = String(input ?? "").trim();
	if (!s.startsWith("{") || !s.endsWith("}")) return null;
	const inner = s.slice(1, -1).trim();
	if (!inner) return {};
	if (inner.includes("{") || inner.includes("[") || inner.includes("]")) return null;
	const parts = [];
	let buf = "";
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner[i];
		if (ch === "\\") {
			buf += ch;
			if (i + 1 < inner.length) {
				buf += inner[i + 1];
				i++;
			}
			continue;
		}
		if (!inDouble && ch === "'") {
			inSingle = !inSingle;
			buf += ch;
			continue;
		}
		if (!inSingle && ch === "\"") {
			inDouble = !inDouble;
			buf += ch;
			continue;
		}
		if (!inSingle && !inDouble && ch === ",") {
			parts.push(buf.trim());
			buf = "";
			continue;
		}
		buf += ch;
	}
	if (buf.trim()) parts.push(buf.trim());
	const out = {};
	for (const part of parts) {
		if (!part) continue;
		let inS = false;
		let inD = false;
		let split = -1;
		for (let i = 0; i < part.length; i++) {
			const ch = part[i];
			if (ch === "\\") {
				i++;
				continue;
			}
			if (!inD && ch === "'") {
				inS = !inS;
				continue;
			}
			if (!inS && ch === "\"") {
				inD = !inD;
				continue;
			}
			if (!inS && !inD && ch === ":") {
				split = i;
				break;
			}
		}
		if (split === -1) return null;
		const rawKey = part.slice(0, split).trim();
		const rawVal = part.slice(split + 1).trim();
		if (!rawKey) return null;
		let key = rawKey;
		if (key.startsWith("\"") && key.endsWith("\"") || key.startsWith("'") && key.endsWith("'")) try {
			key = JSON.parse(key.replace(/^'/, "\"").replace(/'$/, "\""));
		} catch {
			return null;
		}
		if (!/^[_$A-Z][\w$-]*$/i.test(key)) return null;
		let value;
		if (!rawVal) value = "";
		else if (rawVal.startsWith("\"") && rawVal.endsWith("\"") || rawVal.startsWith("'") && rawVal.endsWith("'")) try {
			value = JSON.parse(rawVal.replace(/^'/, "\"").replace(/'$/, "\""));
		} catch {
			value = rawVal;
		}
		else if (/^-?\d+(?:\.\d+)?$/.test(rawVal)) value = Number(rawVal);
		else if (rawVal === "true" || rawVal === "false") value = rawVal === "true";
		else if (rawVal === "null") value = null;
		else value = rawVal;
		out[key] = value;
	}
	return out;
}
function applyContainers(md) {
	[
		"admonition",
		"info",
		"warning",
		"error",
		"tip",
		"danger",
		"note",
		"caution"
	].forEach((name) => {
		md.use(container_plugin, name, { render(tokens, idx) {
			if (tokens[idx].nesting === 1) return `<div class="vmr-container vmr-container-${name}">`;
			else return "</div>\n";
		} });
	});
	md.block.ruler.before("fence", "vmr_container_fallback", (state, startLine, endLine, silent) => {
		const s = state;
		const startPos = s.bMarks[startLine] + s.tShift[startLine];
		const lineMax = s.eMarks[startLine];
		const line = s.src.slice(startPos, lineMax);
		const nameMatch = line.match(/^:::\s*([^\s{]+)/);
		if (!nameMatch) return false;
		const name = nameMatch[1];
		if (!name.trim()) return false;
		const trimmedRest = line.slice(nameMatch[0].length).trim();
		let argsStr;
		let jsonStr;
		const jsonStart = trimmedRest.indexOf("{");
		const jsonCandidate = jsonStart >= 0 ? trimmedRest.slice(jsonStart).trimStart() : void 0;
		if (jsonStart === -1) argsStr = trimmedRest || void 0;
		else {
			argsStr = trimmedRest.slice(0, jsonStart).trim() || void 0;
			if (jsonCandidate?.startsWith("{")) {
				let depth = 0;
				let jsonEnd = -1;
				for (let i = 0; i < jsonCandidate.length; i++) {
					if (jsonCandidate[i] === "{") depth++;
					else if (jsonCandidate[i] === "}") depth--;
					if (depth === 0) {
						jsonEnd = i + 1;
						break;
					}
				}
				if (jsonEnd > 0) jsonStr = jsonCandidate.slice(0, jsonEnd);
			}
			if (!jsonStr) argsStr = trimmedRest || void 0;
		}
		if (silent) return true;
		const envFinal = !!s.env.__markstreamFinal;
		let nextLine = startLine + 1;
		let found = false;
		while (nextLine <= endLine) {
			const sPos = s.bMarks[nextLine] + s.tShift[nextLine];
			const ePos = s.eMarks[nextLine];
			if (s.src.slice(sPos, ePos).trim() === ":::") {
				found = true;
				break;
			}
			nextLine++;
		}
		if (!found) nextLine = endLine;
		const tokenOpen = s.push("vmr_container_open", "div", 1);
		tokenOpen.attrSet("class", `vmr-container vmr-container-${name}`);
		tokenOpen.meta = {
			...tokenOpen.meta ?? {},
			unclosed: !found && !envFinal
		};
		if (argsStr) tokenOpen.attrSet("data-args", argsStr);
		if (jsonStr) try {
			const attrs = JSON.parse(jsonStr);
			for (const [key, value] of Object.entries(attrs)) {
				const isComplexValue = value != null && typeof value === "object";
				tokenOpen.attrSet(`data-${key}`, isComplexValue ? JSON.stringify(value) : String(value));
			}
		} catch {
			const loose = parseLooseInlineAttrs(jsonStr);
			if (loose) for (const [key, value] of Object.entries(loose)) {
				const isComplexValue = value != null && typeof value === "object";
				tokenOpen.attrSet(`data-${key}`, isComplexValue ? JSON.stringify(value) : String(value));
			}
			else tokenOpen.attrSet("data-attrs", jsonStr);
		}
		const contentLines = [];
		for (let i = startLine + 1; i < nextLine; i++) {
			const sPos = s.bMarks[i] + s.tShift[i];
			const ePos = s.eMarks[i];
			contentLines.push(s.src.slice(sPos, ePos));
		}
		if (contentLines.some((line$1) => line$1.trim().length > 0)) {
			let innerSrc = contentLines.join("\n");
			if (!innerSrc.endsWith("\n")) innerSrc += "\n";
			if (!innerSrc.endsWith("\n\n")) innerSrc += "\n";
			const prevToken = s.tokens[s.tokens.length - 1];
			if (prevToken) prevToken.raw = innerSrc;
			const innerTokens = [];
			s.md.block.parse(innerSrc, s.md, s.env, innerTokens);
			s.tokens.push(...innerTokens);
		}
		if (found) s.push("vmr_container_close", "div", -1);
		s.line = found ? nextLine + 1 : nextLine;
		return true;
	}, { alt: [
		"paragraph",
		"reference",
		"blockquote",
		"list"
	] });
}

//#endregion
//#region src/htmlTags.ts
const VOID_HTML_TAG_NAMES = [
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr"
];
const INLINE_HTML_TAG_NAMES = [
	"a",
	"abbr",
	"b",
	"bdi",
	"bdo",
	"button",
	"cite",
	"code",
	"data",
	"del",
	"dfn",
	"em",
	"font",
	"i",
	"ins",
	"kbd",
	"label",
	"mark",
	"q",
	"s",
	"samp",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"time",
	"u",
	"var"
];
const BLOCK_HTML_TAG_NAMES = [
	"article",
	"aside",
	"blockquote",
	"details",
	"div",
	"figcaption",
	"figure",
	"footer",
	"header",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"pre",
	"section",
	"summary",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul"
];
const SVG_HTML_TAG_NAMES = [
	"svg",
	"g",
	"path"
];
const EXTENDED_STANDARD_HTML_TAG_NAMES = [
	"address",
	"audio",
	"body",
	"canvas",
	"caption",
	"colgroup",
	"datalist",
	"dd",
	"dialog",
	"dl",
	"dt",
	"fieldset",
	"form",
	"head",
	"hgroup",
	"html",
	"iframe",
	"legend",
	"map",
	"menu",
	"meter",
	"noscript",
	"object",
	"optgroup",
	"option",
	"output",
	"picture",
	"progress",
	"rp",
	"rt",
	"ruby",
	"script",
	"select",
	"style",
	"template",
	"textarea",
	"tfoot",
	"title",
	"video"
];
const DANGEROUS_HTML_ATTR_NAMES = [
	"onclick",
	"onerror",
	"onload",
	"onmouseover",
	"onmouseout",
	"onmousedown",
	"onmouseup",
	"onkeydown",
	"onkeyup",
	"onfocus",
	"onblur",
	"onsubmit",
	"onreset",
	"onchange",
	"onselect",
	"ondblclick",
	"ontouchstart",
	"ontouchend",
	"ontouchmove",
	"ontouchcancel",
	"onwheel",
	"onscroll",
	"oncopy",
	"oncut",
	"onpaste",
	"oninput",
	"oninvalid",
	"onsearch",
	"srcdoc",
	"ping"
];
const URL_HTML_ATTR_NAMES = [
	"action",
	"data",
	"href",
	"src",
	"srcset",
	"poster",
	"xlink:href",
	"formaction"
];
const BLOCKED_HTML_TAG_NAMES = ["script"];
const NON_STRUCTURING_HTML_TAG_NAMES = [
	"pre",
	"script",
	"style",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"textarea",
	"tr",
	"title"
];
const VOID_HTML_TAGS = new Set(VOID_HTML_TAG_NAMES);
const STANDARD_BLOCK_HTML_TAGS = new Set(BLOCK_HTML_TAG_NAMES);
const STANDARD_HTML_TAGS = new Set([
	...VOID_HTML_TAG_NAMES,
	...INLINE_HTML_TAG_NAMES,
	...BLOCK_HTML_TAG_NAMES,
	...SVG_HTML_TAG_NAMES
]);
const EXTENDED_STANDARD_HTML_TAGS = new Set([...STANDARD_HTML_TAGS, ...EXTENDED_STANDARD_HTML_TAG_NAMES]);
const DANGEROUS_HTML_ATTRS = new Set(DANGEROUS_HTML_ATTR_NAMES);
const URL_HTML_ATTRS = new Set(URL_HTML_ATTR_NAMES);
const BLOCKED_HTML_TAGS = new Set(BLOCKED_HTML_TAG_NAMES);
const NON_STRUCTURING_HTML_TAGS = new Set(NON_STRUCTURING_HTML_TAG_NAMES);
function stripHtmlControlAndWhitespace(value) {
	let out = "";
	for (const ch of value) {
		const code$1 = ch.charCodeAt(0);
		if (code$1 <= 31 || code$1 >= 127 && code$1 <= 159) continue;
		if (/\s/u.test(ch)) continue;
		out += ch;
	}
	return out;
}
const HTML_URL_ENTITY_MAP = {
	amp: "&",
	bsol: "\\",
	colon: ":",
	newline: "\n",
	sol: "/",
	tab: "	"
};
function decodeHtmlUrlEntities(value) {
	return value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));?/gi, (match, decimal, hex, named) => {
		const rawCode = decimal ?? hex;
		if (rawCode) {
			const code$1 = Number.parseInt(rawCode, decimal ? 10 : 16);
			try {
				return Number.isFinite(code$1) ? String.fromCodePoint(code$1) : "";
			} catch {
				return "";
			}
		}
		return HTML_URL_ENTITY_MAP[String(named ?? "").toLowerCase()] ?? match;
	});
}
const HREF_URL_PROTOCOLS = new Set([
	"http",
	"https",
	"mailto",
	"tel"
]);
const RESOURCE_URL_PROTOCOLS = new Set(["http", "https"]);
function getUrlScheme(normalized) {
	return normalized.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? "";
}
function getAllowedUrlProtocols(tagName, attrName) {
	if (attrName === "href") return HREF_URL_PROTOCOLS;
	if (attrName === "xlink:href") return HREF_URL_PROTOCOLS;
	if (attrName === "src") return RESOURCE_URL_PROTOCOLS;
	if (attrName === "srcset") return RESOURCE_URL_PROTOCOLS;
	if (attrName === "poster") return RESOURCE_URL_PROTOCOLS;
	if (attrName === "action" || attrName === "formaction") return RESOURCE_URL_PROTOCOLS;
	if (attrName === "data") return RESOURCE_URL_PROTOCOLS;
	if (tagName === "a" || tagName === "area") return HREF_URL_PROTOCOLS;
	return HREF_URL_PROTOCOLS;
}
function isUnsafeHtmlUrl(value, context = {}) {
	const normalized = stripHtmlControlAndWhitespace(decodeHtmlUrlEntities(value)).toLowerCase();
	const tagName = String(context.tagName ?? "").toLowerCase();
	const attrName = String(context.attrName ?? "").toLowerCase();
	if (!normalized) return false;
	if (normalized.startsWith("data:")) {
		const isBitmapImageData = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);/i.test(normalized);
		if (tagName === "img" && attrName === "src") return !isBitmapImageData;
		return true;
	}
	if (/^[\\/]{2}/.test(normalized)) return true;
	if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../") || normalized.startsWith("#") || normalized.startsWith("?")) return false;
	const scheme = getUrlScheme(normalized);
	if (!scheme) return false;
	return !getAllowedUrlProtocols(tagName, attrName).has(scheme);
}
function shouldOpenLinkInNewTab(href) {
	const value = decodeHtmlUrlEntities(String(href ?? "")).trim();
	if (!value) return false;
	if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value.startsWith("?")) return false;
	const scheme = getUrlScheme(stripHtmlControlAndWhitespace(value).toLowerCase());
	return scheme === "http" || scheme === "https";
}
function sanitizeUrlAttr(value, context = {}) {
	const url = String(value ?? "").trim();
	if (!url) return "";
	return isUnsafeHtmlUrl(url, context) ? "" : url;
}
function sanitizeImageSrc(value) {
	return sanitizeUrlAttr(value, {
		tagName: "img",
		attrName: "src"
	});
}

//#endregion
//#region src/htmlTagUtils.ts
function escapeTagForRegExp(tag) {
	return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findTagCloseIndexOutsideQuotes(input) {
	let inSingle = false;
	let inDouble = false;
	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (ch === "\\") {
			i++;
			continue;
		}
		if (!inDouble && ch === "'") {
			inSingle = !inSingle;
			continue;
		}
		if (!inSingle && ch === "\"") {
			inDouble = !inDouble;
			continue;
		}
		if (!inSingle && !inDouble && ch === ">") return i;
	}
	return -1;
}
function parseTagAttrs(openTag) {
	const attrs = [];
	const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let match;
	while ((match = attrRegex.exec(openTag)) !== null) {
		const attrName = match[1];
		if (!attrName) continue;
		const attrValue = match[2] || match[3] || match[4] || "";
		attrs.push([attrName, attrValue]);
	}
	return attrs;
}

//#endregion
//#region src/customHtmlTags.ts
const HTML_LIKE_TAG_NAME_RE = /^[a-z][a-z0-9_-]*$/;
function isHtmlLikeTagName(tag) {
	return HTML_LIKE_TAG_NAME_RE.test(String(tag ?? "").trim().toLowerCase());
}
function normalizeCustomHtmlTagName(value) {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	if (!raw.startsWith("<")) return isHtmlLikeTagName(raw) ? raw.toLowerCase() : "";
	let index = 1;
	while (index < raw.length && /\s/.test(raw[index])) index++;
	if (raw[index] === "/") {
		index++;
		while (index < raw.length && /\s/.test(raw[index])) index++;
	}
	const start = index;
	while (index < raw.length && /[\w-]/.test(raw[index])) index++;
	const normalized = raw.slice(start, index).toLowerCase();
	const next = raw[index] ?? "";
	if (next && !/[\s/>]/.test(next)) return "";
	return isHtmlLikeTagName(normalized) ? normalized : "";
}
function normalizeCustomHtmlTags(tags) {
	if (!tags || tags.length === 0) return [];
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const tag of tags) {
		const value = normalizeCustomHtmlTagName(tag);
		if (!value || seen.has(value)) continue;
		seen.add(value);
		normalized.push(value);
	}
	return normalized;
}
function mergeCustomHtmlTags(...lists) {
	const seen = /* @__PURE__ */ new Set();
	const normalized = [];
	for (const list$1 of lists) for (const tag of normalizeCustomHtmlTags(list$1)) {
		if (seen.has(tag)) continue;
		seen.add(tag);
		normalized.push(tag);
	}
	return normalized;
}
function resolveCustomHtmlTags(tags) {
	const normalized = normalizeCustomHtmlTags(tags);
	return {
		key: normalized.join(","),
		tags: normalized
	};
}
function getHtmlTagFromContent(html) {
	return normalizeCustomHtmlTagName(html);
}
function hasCompleteHtmlTagContent(html, tag) {
	const raw = String(html ?? "");
	const normalizedTag = normalizeCustomHtmlTagName(tag);
	if (!normalizedTag) return false;
	const escaped = escapeTagForRegExp(normalizedTag);
	const openMatch = raw.match(new RegExp(String.raw`^\s*<\s*${escaped}(?:\s[^>]*)?(\s*\/)?>`, "i"));
	if (!openMatch) return false;
	if (openMatch[1]) return true;
	return new RegExp(String.raw`<\s*\/\s*${escaped}\s*>`, "i").test(raw);
}
function shouldRenderUnknownHtmlTagAsText(html, tag) {
	const normalizedTag = normalizeCustomHtmlTagName(tag);
	return Boolean(normalizedTag) && !STANDARD_HTML_TAGS.has(normalizedTag) && !hasCompleteHtmlTagContent(html, normalizedTag);
}
function stripCustomHtmlWrapper(html, tag) {
	const raw = String(html ?? "");
	const normalizedTag = normalizeCustomHtmlTagName(tag);
	if (!normalizedTag) return raw;
	const escaped = escapeTagForRegExp(normalizedTag);
	const openRe = new RegExp(String.raw`^\s*<\s*${escaped}(?:\s[^>]*)?>\s*`, "i");
	const closeRe = new RegExp(String.raw`\s*<\s*\/\s*${escaped}\s*>\s*$`, "i");
	return raw.replace(openRe, "").replace(closeRe, "");
}

//#endregion
//#region src/plugins/fixHtmlInline.ts
const VOID_TAGS = VOID_HTML_TAGS;
const BASE_COMMON_HTML_TAGS = STANDARD_HTML_TAGS;
const BLOCK_LEVEL_HTML_TAGS = new Set(STANDARD_BLOCK_HTML_TAGS);
BLOCK_LEVEL_HTML_TAGS.delete("details");
const OPEN_TAG_RE = /<([A-Z][\w-]*)(?=[\s/>]|$)/gi;
const CLOSE_TAG_RE = /<\/\s*([A-Z][\w-]*)(?=[\s/>]|$)/gi;
const TAG_NAME_AT_START_RE = /^<\s*(?:\/\s*)?([A-Z][\w-]*)/i;
const STRICT_OPEN_TAG_NAME_AT_START_RE = /^<\s*([A-Z][\w:-]*)(?=[\s/>]|$)/i;
function getHtmlInlineTagName(content) {
	return (content.match(TAG_NAME_AT_START_RE)?.[1] ?? "").toLowerCase();
}
function isHtmlInlineClosingTag(content) {
	return /^\s*<\s*\//.test(content);
}
function isSelfClosingHtmlInline(content, tag) {
	return VOID_TAGS.has(tag) || /\/\s*>\s*$/.test(content);
}
function findMatchingCloseChildIndex(children, tag) {
	let depth = 0;
	for (let index = 0; index < children.length; index++) {
		const child = children[index];
		if (!child || child.type !== "html_inline") continue;
		const content = String(child.content ?? "");
		const childTag = getHtmlInlineTagName(content);
		if (childTag !== tag) continue;
		if (isHtmlInlineClosingTag(content)) {
			if (depth === 0) return index;
			depth--;
			continue;
		}
		if (!isSelfClosingHtmlInline(content, childTag)) depth++;
	}
	return -1;
}
function getTrailingOpenDepth(children, tag) {
	let depth = 0;
	for (const child of children) {
		if (!child || child.type !== "html_inline") continue;
		const content = String(child.content ?? "");
		const childTag = getHtmlInlineTagName(content);
		if (childTag !== tag) continue;
		if (isHtmlInlineClosingTag(content)) {
			if (depth > 0) depth--;
			continue;
		}
		if (!isSelfClosingHtmlInline(content, childTag)) depth++;
	}
	return depth;
}
function findMatchingCloseRangeInHtml(content, tag, startIndex = 0) {
	const tokenRe = new RegExp(String.raw`<\s*(\/?)\s*${escapeTagForRegExp(tag)}(?=[\s>/])[^>]*>`, "gi");
	tokenRe.lastIndex = Math.max(0, startIndex);
	let depth = 0;
	let match;
	while ((match = tokenRe.exec(content)) !== null) {
		const raw = match[0] ?? "";
		const closing = !!match[1];
		const selfClosing = !closing && /\/\s*>$/.test(raw);
		if (closing) {
			if (depth === 0) return {
				start: match.index,
				end: match.index + raw.length
			};
			depth--;
			continue;
		}
		if (!selfClosing) depth++;
	}
	return null;
}
function getTrailingCustomTagDepthInHtml(content, tag) {
	const tokenRe = new RegExp(String.raw`<\s*(\/?)\s*${escapeTagForRegExp(tag)}(?=[\s>/])[^>]*>`, "gi");
	let depth = 0;
	let match;
	while ((match = tokenRe.exec(content)) !== null) {
		const raw = match[0] ?? "";
		const closing = !!match[1];
		const selfClosing = !closing && /\/\s*>$/.test(raw);
		if (closing) {
			if (depth > 0) depth--;
			continue;
		}
		if (!selfClosing) depth++;
	}
	return depth;
}
function tokenToRaw$1(token) {
	const shape = token;
	return String(shape.raw ?? shape.content ?? shape.markup ?? "");
}
function getMutableMeta(token) {
	const target = token;
	if (!target.meta) target.meta = {};
	return target.meta;
}
function setCustomHtmlSourceMeta(token, raw, inner) {
	const meta = getMutableMeta(token);
	meta.markstreamCustomHtmlRaw = raw;
	meta.markstreamCustomHtmlInner = inner;
}
function attachCustomHtmlSourceMeta(tokens, customTagSet) {
	if (!customTagSet.size) return;
	const customTagOpenRes = Array.from(customTagSet, (tag) => new RegExp(String.raw`<\s*${escapeTagForRegExp(tag)}(?=[\s>/])`, "i"));
	const stack = [];
	let needsTopLevelSeparator = false;
	const mayOpenCustomTag = (source) => {
		if (!source) return false;
		return customTagOpenRes.some((re) => re.test(source));
	};
	const appendToOpenFrames = (raw) => {
		if (!raw || !stack.length) return;
		for (const frame of stack) {
			frame.raw += raw;
			frame.inner += raw;
		}
	};
	const appendTopLevelSeparator = () => {
		if (!stack.length || !needsTopLevelSeparator) return;
		appendToOpenFrames("\n");
		needsTopLevelSeparator = false;
	};
	const appendSourceGap = (gap) => {
		appendToOpenFrames(gap);
	};
	const closeTopFrameWithRaw = (raw) => {
		for (let i = 0; i < stack.length; i++) {
			stack[i].raw += raw;
			if (i < stack.length - 1) stack[i].inner += raw;
		}
		const frame = stack.pop();
		setCustomHtmlSourceMeta(frame.token, frame.raw, frame.inner);
	};
	const getTopFrameClosePrefix = (raw) => {
		const tag = stack[stack.length - 1]?.tag;
		if (!tag) return null;
		const closePrefixRe = new RegExp(String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>`, "i");
		return raw.match(closePrefixRe)?.[0] ?? null;
	};
	const startsWithTopFrameClose = (source) => {
		return !!getTopFrameClosePrefix(source);
	};
	const handleToken = (child, raw, knownTag) => {
		const tag = knownTag ?? (child.type === "html_inline" ? getHtmlInlineTagName(raw) : "");
		if (!(tag && customTagSet.has(tag))) {
			appendToOpenFrames(raw);
			return;
		}
		const closing = isHtmlInlineClosingTag(raw);
		const selfClosing = !closing && isSelfClosingHtmlInline(raw, tag);
		if (closing) {
			if (!stack.length || stack[stack.length - 1].tag !== tag) {
				appendToOpenFrames(raw);
				return;
			}
			closeTopFrameWithRaw(raw);
			return;
		}
		appendToOpenFrames(raw);
		if (selfClosing) {
			setCustomHtmlSourceMeta(child, raw, "");
			return;
		}
		stack.push({
			tag,
			token: child,
			raw,
			inner: ""
		});
	};
	for (const token of tokens) {
		if (token.type === "inline" && Array.isArray(token.children)) {
			const source = String(token.content ?? "");
			if (startsWithTopFrameClose(source)) needsTopLevelSeparator = false;
			else appendTopLevelSeparator();
			if (!stack.length && !mayOpenCustomTag(source)) {
				needsTopLevelSeparator = false;
				continue;
			}
			let cursor = 0;
			let sourceReliable = true;
			for (const child of token.children) {
				const childRaw = tokenToRaw$1(child);
				const tag = child.type === "html_inline" ? getHtmlInlineTagName(childRaw) : "";
				const isCustomTag = tag && customTagSet.has(tag);
				let raw = childRaw;
				if (sourceReliable && source && childRaw && (stack.length || isCustomTag)) {
					const index = source.indexOf(childRaw, cursor);
					if (index !== -1) {
						appendSourceGap(source.slice(cursor, index));
						raw = source.slice(index, index + childRaw.length);
						cursor = index + childRaw.length;
					} else {
						if (stack.length && !isCustomTag) continue;
						sourceReliable = false;
					}
				}
				handleToken(child, raw, tag);
			}
			if (sourceReliable && source && cursor < source.length && stack.length) appendSourceGap(source.slice(cursor));
			needsTopLevelSeparator = stack.length > 0;
			continue;
		}
		if (stack.length && typeof token.content === "string") {
			const raw = tokenToRaw$1(token);
			const closePrefix = token.type === "html_block" ? getTopFrameClosePrefix(raw) : null;
			if (closePrefix) {
				closeTopFrameWithRaw(`${needsTopLevelSeparator ? "\n" : ""}${closePrefix}`);
				needsTopLevelSeparator = stack.length > 0;
				continue;
			}
			if (!token.content) continue;
			appendTopLevelSeparator();
			appendToOpenFrames(token.content);
			needsTopLevelSeparator = true;
		}
	}
	for (const frame of stack) setCustomHtmlSourceMeta(frame.token, frame.raw, frame.inner);
}
function isNonElementHtmlBlock(content) {
	return /^\s*<\s*[!?]/.test(content);
}
function buildCommonHtmlTagSet(extraTags) {
	const set = new Set(BASE_COMMON_HTML_TAGS);
	if (extraTags && Array.isArray(extraTags)) for (const t of extraTags) {
		const raw = String(t ?? "").trim();
		if (!raw) continue;
		const m = raw.match(/^[<\s/]*([A-Z][\w-]*)/i);
		if (!m) continue;
		set.add(m[1].toLowerCase());
	}
	return set;
}
function isCommonHtmlTagOrPrefix(tag, tagSet) {
	if (tagSet.has(tag)) return true;
	for (const common of tagSet) if (common.startsWith(tag)) return true;
	return false;
}
function findFirstIncompleteTag(content, tagSet) {
	let first = null;
	for (const m of content.matchAll(OPEN_TAG_RE)) {
		const idx = m.index ?? -1;
		if (idx < 0) continue;
		const tag = (m[1] ?? "").toLowerCase();
		if (!isCommonHtmlTagOrPrefix(tag, tagSet)) continue;
		if (findTagCloseIndexOutsideQuotes(content.slice(idx)) !== -1) continue;
		if (!first || idx < first.index) first = {
			index: idx,
			tag,
			closing: false
		};
	}
	for (const m of content.matchAll(CLOSE_TAG_RE)) {
		const idx = m.index ?? -1;
		if (idx < 0) continue;
		const tag = (m[1] ?? "").toLowerCase();
		if (!isCommonHtmlTagOrPrefix(tag, tagSet)) continue;
		if (findTagCloseIndexOutsideQuotes(content.slice(idx)) !== -1) continue;
		if (!first || idx < first.index) first = {
			index: idx,
			tag,
			closing: true
		};
	}
	const bareClose = /<\/\s*$/.exec(content);
	if (bareClose && typeof bareClose.index === "number") {
		const idx = bareClose.index;
		if (!content.slice(idx).includes(">") && (!first || idx < first.index)) first = {
			index: idx,
			tag: "",
			closing: true
		};
	}
	const bareOpen = /<\s*$/.exec(content);
	if (bareOpen && typeof bareOpen.index === "number") {
		const idx = bareOpen.index;
		const rest = content.slice(idx);
		if (!rest.startsWith("</") && !rest.includes(">") && (!first || idx < first.index)) first = {
			index: idx,
			tag: "",
			closing: false
		};
	}
	return first;
}
function splitTextToken(token, content) {
	const t = token;
	return Object.assign(Object.create(Object.getPrototypeOf(t)), t, {
		type: "text",
		content,
		raw: content
	});
}
function fixStreamingHtmlInlineChildren(children, tagSet) {
	if (!children.length) return { children };
	const out = [];
	let pending = null;
	let pendingAtEnd = null;
	function pushTextPart(text$1, baseToken) {
		if (!text$1) return;
		if (baseToken) out.push(splitTextToken(baseToken, text$1));
		else out.push({
			type: "text",
			content: text$1,
			raw: text$1
		});
	}
	function splitCompleteHtmlFromText(chunk, baseToken) {
		let cursor = 0;
		while (cursor < chunk.length) {
			const lt = chunk.indexOf("<", cursor);
			if (lt === -1) {
				pushTextPart(chunk.slice(cursor), baseToken);
				break;
			}
			pushTextPart(chunk.slice(cursor, lt), baseToken);
			const sub = chunk.slice(lt);
			const tagMatch = sub.match(TAG_NAME_AT_START_RE);
			if (!tagMatch) {
				pushTextPart("<", baseToken);
				cursor = lt + 1;
				continue;
			}
			const closeIdx = findTagCloseIndexOutsideQuotes(sub);
			if (closeIdx === -1) {
				pushTextPart("<", baseToken);
				cursor = lt + 1;
				continue;
			}
			const tagText = sub.slice(0, closeIdx + 1);
			const tagName = (tagMatch[1] ?? "").toLowerCase();
			if (tagSet.has(tagName)) out.push({
				type: "html_inline",
				tag: "",
				content: tagText,
				raw: tagText
			});
			else pushTextPart(tagText, baseToken);
			cursor = lt + tagText.length;
		}
	}
	function processTextChunk(chunk, baseToken) {
		if (!chunk) return;
		const match = findFirstIncompleteTag(chunk, tagSet);
		if (!match) {
			splitCompleteHtmlFromText(chunk, baseToken);
			return;
		}
		const before = chunk.slice(0, match.index);
		if (before) splitCompleteHtmlFromText(before, baseToken);
		pending = {
			tag: match.tag,
			buffer: chunk.slice(match.index),
			closing: match.closing
		};
		pendingAtEnd = pending.buffer;
	}
	for (const child of children) {
		if (pending) {
			pending.buffer += tokenToRaw$1(child);
			pendingAtEnd = pending.buffer;
			const closeIdx = findTagCloseIndexOutsideQuotes(pending.buffer);
			if (closeIdx === -1) continue;
			const tagChunk = pending.buffer.slice(0, closeIdx + 1);
			const afterChunk = pending.buffer.slice(closeIdx + 1);
			out.push({
				type: "html_inline",
				tag: "",
				content: tagChunk,
				raw: tagChunk
			});
			pending = null;
			pendingAtEnd = null;
			if (afterChunk) processTextChunk(afterChunk);
			continue;
		}
		if (child.type === "html_inline") {
			const content = tokenToRaw$1(child);
			const tagName = (content.match(TAG_NAME_AT_START_RE)?.[1] ?? "").toLowerCase();
			if (tagName && tagSet.has(tagName) && findTagCloseIndexOutsideQuotes(content) === -1) {
				pending = {
					tag: tagName,
					buffer: content,
					closing: /^<\s*\//.test(content)
				};
				pendingAtEnd = pending.buffer;
				continue;
			}
		}
		if (child.type === "text") {
			const content = String(child.content ?? "");
			if (!content.includes("<")) {
				out.push(child);
				continue;
			}
			processTextChunk(content, child);
			continue;
		}
		out.push(child);
	}
	return {
		children: out,
		pendingBuffer: pendingAtEnd ?? void 0
	};
}
const BASE_AUTO_CLOSE_INLINE_TAGS = [
	"a",
	"span",
	"strong",
	"em",
	"b",
	"i",
	"u"
];
function applyFixHtmlInlineTokens(md, options = {}) {
	const configuredCustomTagSet = /* @__PURE__ */ new Set();
	if (options.customHtmlTags?.length) for (const t of options.customHtmlTags) {
		const name = normalizeCustomHtmlTagName(t);
		if (!name) continue;
		configuredCustomTagSet.add(name);
	}
	const getRuleContext = (state) => {
		const s = state;
		const customTagSet = new Set(configuredCustomTagSet);
		const envTags = Array.isArray(s.env?.__markstreamCustomHtmlTags) ? s.env.__markstreamCustomHtmlTags : [];
		for (const t of envTags) {
			const name = normalizeCustomHtmlTagName(String(t ?? ""));
			if (name) customTagSet.add(name);
		}
		const commonHtmlTags = buildCommonHtmlTagSet(Array.from(customTagSet));
		const autoCloseInlineTagSet = new Set(BASE_AUTO_CLOSE_INLINE_TAGS);
		for (const tag of customTagSet) autoCloseInlineTagSet.add(tag);
		const shouldMergeHtmlBlockTag = (tag) => customTagSet.has(tag) || !commonHtmlTags.has(tag) || BLOCK_LEVEL_HTML_TAGS.has(tag);
		return {
			autoCloseInlineTagSet,
			commonHtmlTags,
			customTagSet,
			shouldMergeHtmlBlockTag
		};
	};
	const getHtmlBlockCarrierContent = (token) => {
		if (token.type === "html_block") return String(token.content ?? "");
		if (token.type !== "inline" || !Array.isArray(token.children) || token.children.length !== 1) return "";
		const onlyChild = token.children[0];
		if (onlyChild?.type !== "html_block") return "";
		return String(token.content ?? onlyChild.content ?? "");
	};
	const normalizeHtmlBlockCarrier = (token, content) => {
		token.type = "html_block";
		token.content = content;
		token.raw = content;
		token.children = [];
	};
	const stripLeadingLineSeparators = (content) => content.replace(/^(?:\r?\n)+/, "");
	const isIndentedCodeTrailingContent = (content) => /^(?: {4}|\t)/.test(content);
	const normalizeIndentedCodeTrailingContent = (content) => content.replace(/^(?: {4}|\t)/gm, "");
	const createTrailingContentTokens = (content, textMode) => {
		const source = stripLeadingLineSeparators(content);
		if (!/\S/.test(source)) return [];
		if (isIndentedCodeTrailingContent(source)) return [{
			type: "code_block",
			content: normalizeIndentedCodeTrailingContent(source),
			raw: source
		}];
		const text$1 = source.replace(/^[\t ]+/, "");
		if (!text$1) return [];
		if (text$1.startsWith("<")) return [{
			type: "html_block",
			content: text$1
		}];
		const inlineToken = {
			type: "inline",
			tag: "",
			nesting: 0,
			content: text$1,
			children: [{
				type: "text",
				content: text$1,
				raw: text$1
			}]
		};
		if (textMode === "paragraph") return [
			{
				type: "paragraph_open",
				tag: "p",
				nesting: 1
			},
			inlineToken,
			{
				type: "paragraph_close",
				tag: "p",
				nesting: -1
			}
		];
		if (textMode === "text") return [{
			type: "text",
			content: text$1,
			raw: text$1
		}];
		return [inlineToken];
	};
	const getTrailingContentTextMode = (tokens, index, fallback) => {
		return tokens[index - 1]?.type === "paragraph_open" && tokens[index + 1]?.type === "paragraph_close" ? "inline" : fallback;
	};
	const appendTrailingInlineContent = (token, content) => {
		const source = stripLeadingLineSeparators(content);
		if (!/\S/.test(source) || token.type !== "inline" || !Array.isArray(token.children)) return false;
		token.content = `${String(token.content ?? "")}${source}`;
		token.children.push({
			type: "text",
			content: source,
			raw: source
		});
		return true;
	};
	md.core.ruler.after("inline", "fix_html_inline_streaming", (state) => {
		const toks = state.tokens ?? [];
		const { commonHtmlTags, customTagSet } = getRuleContext(state);
		for (const t of toks) {
			const tok = t;
			if (tok.type !== "inline" || !Array.isArray(tok.children)) continue;
			const originalContent = String(tok.content ?? "");
			const sourceChildren = tok.children.length ? tok.children : originalContent.includes("<") ? [{
				type: "text",
				content: originalContent,
				raw: originalContent
			}] : null;
			if (!sourceChildren) continue;
			try {
				const fixed = fixStreamingHtmlInlineChildren(sourceChildren, commonHtmlTags);
				tok.children = fixed.children;
				if (fixed.pendingBuffer) {
					const idx = originalContent.lastIndexOf(fixed.pendingBuffer);
					if (idx !== -1) {
						const trimmed = originalContent.slice(0, idx);
						tok.content = trimmed;
						if (typeof tok.raw === "string") tok.raw = trimmed;
					}
				}
			} catch (e) {
				console.error("[applyFixHtmlInlineTokens] failed to fix streaming html inline", e);
			}
		}
		attachCustomHtmlSourceMeta(toks, customTagSet);
	});
	md.core.ruler.push("fix_html_inline_tokens", (state) => {
		const toks = state.tokens ?? [];
		const { autoCloseInlineTagSet, customTagSet, shouldMergeHtmlBlockTag } = getRuleContext(state);
		const tagStack = [];
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			if (tagStack.length > 0) {
				const [openTag, openIndex] = tagStack[tagStack.length - 1];
				if (i !== openIndex) {
					if (t.type === "paragraph_open" || t.type === "paragraph_close") {
						toks.splice(i, 1);
						i--;
						continue;
					}
					const chunk = String(t.content ?? t.raw ?? "");
					if (chunk) {
						const openToken = toks[openIndex];
						const mergedContent = `${String(openToken.content || "")}\n${chunk}`;
						const openEnd = findTagCloseIndexOutsideQuotes(mergedContent);
						const closeRange = openEnd === -1 ? null : findMatchingCloseRangeInHtml(mergedContent, openTag, openEnd + 1);
						if (closeRange) {
							const before = mergedContent.slice(0, closeRange.end);
							const after = mergedContent.slice(closeRange.end);
							openToken.content = before;
							openToken.loading = false;
							toks.splice(i, 1);
							tagStack.pop();
							const replacement = appendTrailingInlineContent(openToken, after) ? [] : createTrailingContentTokens(after, getTrailingContentTextMode(toks, i, "paragraph"));
							if (replacement.length) toks.splice(i, 0, ...replacement);
							i--;
							continue;
						}
						openToken.content = mergedContent;
						if (openToken.loading !== false) openToken.loading = true;
					}
					toks.splice(i, 1);
					i--;
					continue;
				}
			}
			const rawContent = getHtmlBlockCarrierContent(t);
			if (rawContent) {
				if (isNonElementHtmlBlock(rawContent)) continue;
				const tag = (rawContent.match(/<\s*(?:\/\s*)?([^\s>/]+)/)?.[1] ?? "").toLowerCase();
				const isClosingTag$1 = /^\s*<\s*\//.test(rawContent);
				if (!tag || !shouldMergeHtmlBlockTag(tag)) continue;
				normalizeHtmlBlockCarrier(t, rawContent);
				if (!isClosingTag$1) {
					if (tag) {
						if (!new RegExp(`^\\s*<\\s*${tag}\\b[^>]*\\/\\s*>`, "i").test(rawContent) && getTrailingCustomTagDepthInHtml(rawContent, tag) > 0) tagStack.push([tag, i]);
					}
				} else if (tagStack.length > 0 && tag && tagStack[tagStack.length - 1][0] === tag) {
					const [, openIndex] = tagStack[tagStack.length - 1];
					const openToken = toks[openIndex];
					openToken.content = `${String(openToken.content || "")}\n${rawContent}`;
					openToken.loading = false;
					tagStack.pop();
					toks.splice(i, 1);
					i--;
				}
				continue;
			} else if (tagStack.length > 0) {
				if (t.type === "paragraph_open" || t.type === "paragraph_close") {
					toks.splice(i, 1);
					i--;
					continue;
				}
				const content = t.content || "";
				const isClosingTag$1 = new RegExp(`<\\s*\\/\\s*${tagStack[tagStack.length - 1][0]}\\s*>`, "i").test(content);
				if (content) {
					const [, openIndex] = tagStack[tagStack.length - 1];
					const openToken = toks[openIndex];
					openToken.content = `${openToken.content || ""}\n${content}`;
					if (openToken.loading !== false) openToken.loading = !isClosingTag$1;
				}
				if (isClosingTag$1) tagStack.pop();
				toks.splice(i, 1);
				i--;
			} else continue;
		}
		if (customTagSet.size > 0) {
			const openReCache = /* @__PURE__ */ new Map();
			const closeReCache = /* @__PURE__ */ new Map();
			const getOpenRe = (tag) => {
				let r = openReCache.get(tag);
				if (!r) {
					r = new RegExp(`<\\s*${tag}\\b`, "i");
					openReCache.set(tag, r);
				}
				return r;
			};
			const getCloseRe = (tag) => {
				let r = closeReCache.get(tag);
				if (!r) {
					r = new RegExp(`<\\s*\\/\\s*${tag}\\s*>`, "i");
					closeReCache.set(tag, r);
				}
				return r;
			};
			const stack = [];
			for (let i = 0; i < toks.length; i++) {
				const tok = toks[i];
				const content = String(tok.content ?? "");
				if (stack.length > 0) {
					const top = stack[stack.length - 1];
					const openTok = toks[top.index];
					const htmlBlockCloseMatch = tok.type === "html_block" ? getCloseRe(top.tag).exec(content) : null;
					if (htmlBlockCloseMatch) {
						const closeEnd = htmlBlockCloseMatch.index + htmlBlockCloseMatch[0].length;
						const closeContent = content.slice(0, closeEnd);
						const afterContent = content.slice(closeEnd);
						openTok.content = `${String(openTok.content ?? "")}\n${closeContent}`;
						if (Array.isArray(openTok.children)) openTok.children.push({
							type: "html_inline",
							content: `</${top.tag}>`,
							raw: `</${top.tag}>`
						});
						stack.pop();
						const replacement = appendTrailingInlineContent(openTok, afterContent) ? [] : createTrailingContentTokens(afterContent, getTrailingContentTextMode(toks, i, "paragraph"));
						if (replacement.length) toks.splice(i, 1, ...replacement);
						else {
							toks.splice(i, 1);
							i--;
						}
						continue;
					}
					if (tok.type !== "inline") continue;
					const children$1 = Array.isArray(tok.children) ? tok.children : [];
					const closeChildIndex = findMatchingCloseChildIndex(children$1, top.tag);
					if (closeChildIndex !== -1) {
						const beforeChildren = children$1.slice(0, closeChildIndex + 1);
						const afterChildren = children$1.slice(closeChildIndex + 1);
						const beforeText = beforeChildren.map((c) => String(c?.content ?? c?.raw ?? "")).join("");
						openTok.content = `${String(openTok.content ?? "")}\n${beforeText}`;
						if (Array.isArray(openTok.children)) openTok.children.push(...beforeChildren);
						if (afterChildren.length) {
							const afterText = afterChildren.map((c) => String(c.content ?? c.raw ?? "")).join("");
							if (afterText.trim()) {
								const trimmed = afterText.replace(/^\s+/, "");
								if (appendTrailingInlineContent(openTok, afterText)) {
									toks.splice(i, 1);
									i--;
								} else if (trimmed.startsWith("<")) toks.splice(i, 1, {
									type: "html_block",
									content: trimmed
								});
								else {
									const replacement = createTrailingContentTokens(afterText, getTrailingContentTextMode(toks, i, "paragraph"));
									toks.splice(i, 1, ...replacement);
								}
							} else {
								toks.splice(i, 1);
								i--;
							}
						} else {
							toks.splice(i, 1);
							i--;
						}
						stack.pop();
						continue;
					}
					openTok.content = `${String(openTok.content ?? "")}\n${content}`;
					if (Array.isArray(openTok.children)) openTok.children.push(...children$1);
					toks.splice(i, 1);
					i--;
					continue;
				}
				if (tok.type !== "inline") continue;
				const children = Array.isArray(tok.children) ? tok.children : [];
				for (const tag of customTagSet) if ((children.length ? getTrailingOpenDepth(children, tag) : getOpenRe(tag).test(content) && !getCloseRe(tag).test(content) ? 1 : 0) > 0) {
					stack.push({
						tag,
						index: i
					});
					break;
				}
			}
		}
		{
			let depth = 0;
			for (let i = 0; i < toks.length; i++) {
				const t = toks[i];
				if (t.type === "paragraph_open") {
					depth++;
					continue;
				}
				if (t.type === "paragraph_close") if (depth > 0) depth--;
				else {
					toks.splice(i, 1);
					i--;
				}
			}
		}
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			if (t.type === "html_block") {
				const tag = (t.content?.match(/<([^\s>/]+)/)?.[1] ?? "").toLowerCase();
				if (tag.startsWith("!") || tag.startsWith("?")) {
					t.loading = false;
					continue;
				}
				if (customTagSet.has(tag)) {
					const raw$2 = String(t.content ?? "");
					const openEnd = findTagCloseIndexOutsideQuotes(raw$2);
					const closeRange = openEnd === -1 ? null : findMatchingCloseRangeInHtml(raw$2, tag, openEnd + 1);
					t.loading = !!closeRange ? false : t.loading !== void 0 ? t.loading : true;
					const endTagIndex$1 = closeRange?.start ?? -1;
					const closeLen$1 = closeRange ? closeRange.end - closeRange.start : 0;
					if (endTagIndex$1 !== -1) {
						const rawForNode = raw$2.slice(0, endTagIndex$1 + closeLen$1);
						let inner = "";
						if (openEnd !== -1 && openEnd < endTagIndex$1) inner = raw$2.slice(openEnd + 1, endTagIndex$1);
						t.children = [{
							type: tag,
							content: inner,
							raw: rawForNode,
							attrs: [],
							tag,
							loading: false
						}];
						t.content = rawForNode;
						t.raw = rawForNode;
						const replacement = createTrailingContentTokens(raw$2.slice(endTagIndex$1 + closeLen$1) || "", "text");
						if (replacement.length) toks.splice(i + 1, 0, ...replacement);
					} else t.children = [{
						type: tag,
						content: "",
						raw: raw$2,
						attrs: [],
						tag,
						loading: true
					}];
					continue;
				}
				if ([
					"br",
					"hr",
					"img",
					"input",
					"link",
					"meta",
					"div",
					"p",
					"ul",
					"li"
				].includes(tag)) continue;
				t.type = "inline";
				const attrs = [];
				const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
				let match;
				while ((match = attrRegex.exec(t.content || "")) !== null) {
					const attrName = match[1];
					const attrValue = match[2] || match[3] || match[4] || "";
					attrs.push([attrName, attrValue]);
				}
				const raw$1 = String(t.content ?? "");
				const closeMatch = new RegExp(`<\\/\\s*${tag}\\s*>`, "i").exec(raw$1);
				const endTagIndex = closeMatch ? closeMatch.index : -1;
				const closeLen = closeMatch ? closeMatch[0].length : 0;
				if (endTagIndex !== -1) {
					const rawForNode = raw$1.slice(0, endTagIndex + closeLen);
					const afterTrimmed = (raw$1.slice(endTagIndex + closeLen) || "").replace(/^\s+/, "");
					t.children = [{
						type: "html_block",
						content: rawForNode,
						tag,
						loading: false
					}];
					t.content = rawForNode;
					t.raw = rawForNode;
					if (afterTrimmed) toks.splice(i + 1, 0, afterTrimmed.startsWith("<") ? {
						type: "html_block",
						content: afterTrimmed
					} : {
						type: "text",
						content: afterTrimmed,
						raw: afterTrimmed
					});
				} else t.children = [{
					type: "html_block",
					content: t.content,
					tag,
					loading: true
				}];
				continue;
			}
			if (!t || t.type !== "inline") continue;
			if (t.children.length === 2 && t.children[0].type === "html_inline") {
				const tag = (t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? "").toLowerCase();
				const second = t.children[1];
				const secondCloseTag = String(second?.content ?? "").match(/^<\s*\/\s*([^\s>]+)/)?.[1]?.toLowerCase() ?? "";
				if (second?.type === "html_inline" && secondCloseTag === tag) continue;
				if (autoCloseInlineTagSet.has(tag)) {
					t.children[0].loading = true;
					t.children[0].tag = tag;
					t.children.push({
						type: "html_inline",
						tag,
						loading: true,
						content: `</${tag}>`
					});
				} else t.children = [{
					type: "html_block",
					loading: true,
					tag,
					content: String(t.children[0]?.content ?? "") + String(t.children[1]?.content ?? "")
				}];
				continue;
			} else if (t.children.length === 3 && t.children[0].type === "html_inline" && t.children[2].type === "html_inline") {
				const tag = (t.children[0].content?.match(/<([^\s>/]+)/)?.[1] ?? "").toLowerCase();
				if (autoCloseInlineTagSet.has(tag)) continue;
				t.children = [{
					type: "html_block",
					loading: false,
					tag,
					content: t.children.map((ct) => ct.content).join("")
				}];
				continue;
			}
			if (!t.content?.startsWith("<") || t.children?.length !== 1) continue;
			const raw = String(t.content);
			const htmlToken = t;
			const onlyChild = htmlToken.children[0];
			if (onlyChild?.type !== "html_inline") {
				if (/^<\s*(?:\/\s*)?[A-Z][\w:-]*\s*$/i.test(raw)) htmlToken.children.length = 0;
				continue;
			}
			const strictTagName = String(onlyChild.content ?? raw).match(STRICT_OPEN_TAG_NAME_AT_START_RE)?.[1]?.toLowerCase() ?? "";
			if (!strictTagName) continue;
			if (/\/\s*>\s*$/.test(raw) || VOID_TAGS.has(strictTagName)) {
				htmlToken.children = [{
					type: "html_inline",
					content: raw
				}];
				continue;
			}
			htmlToken.children.length = 0;
		}
	});
}

//#endregion
//#region src/plugins/fixIndentedCodeBlock.ts
/**
* Check if a line looks like code (vs plain text or HTML entities).
* Returns true if the line appears to be code.
*/
function looksLikeCode(line) {
	const trimmed = line.trim();
	if (!trimmed) return false;
	if (/^&[a-z0-9#]+;/i.test(trimmed)) return false;
	if (/^(?:const|let|var|function|class|import|export|if|for|while|return|await|async|yield|try|catch|throw|new|typeof|instanceof|switch|case|break|continue|def|ruby|perl|print|echo|true|false|null|undefined|NaN|Infinity|this)\b/.test(trimmed)) return true;
	if (/[a-z_$][\w$]*(?:\.[a-z_$][\w$]*|\['[^']*'\]|\["[^"]*"\]|\[\d+\])*\s*\(/i.test(trimmed)) return true;
	if (/[a-z_$][\w$]*(?:\.[a-z_$][\w$]*|\['[^']*'\]|\["[^"]*"\]|\[[\d+\]])+/i.test(trimmed)) return true;
	if (/\w+\s*(?:===?|!==?|<=?|>=?|\+\+|--|&&|\|\||\?\.)/.test(trimmed)) return true;
	if (/^(?:!!|\+\+|--)\s*\w/.test(trimmed)) return true;
	if (/[\w$]+\s*(?:\+=|-=|\*=|\/=|%=|\*\*=|=)/.test(trimmed)) return true;
	if (/^(?:https?:\/\/|ftp:\/\/|file:\/\/|\/\/|www\.)/i.test(trimmed)) return true;
	if (/`[^`]*\$\{[^}]*\}[^`]*`/.test(trimmed)) return true;
	if (/<\/?[A-Z][a-zA-Z0-9]*/.test(trimmed)) return true;
	if (/<[a-z][a-z0-9]*\s[^>]+>/.test(trimmed)) return true;
	if (/^(["'`]).*\1\s*[;,]?$/.test(trimmed)) return true;
	if (/^\[[\s\S]*\]$/.test(trimmed) || /^\{[\s\S]*\}$/.test(trimmed) || /^\(\s*\)$/.test(trimmed)) return true;
	if (/[\w$]+(?:\s*[+\-*/%<>=!&|^~:]+\s*[\w$]+|\s*\.\s*[\w$]+)/.test(trimmed)) return true;
	if (/=>|->|::/.test(trimmed)) return true;
	if (/^@[\w.$]+$/.test(trimmed)) return true;
	if (/^(?:0x[0-9a-fA-F]+|0b[01]+|0o[0-7]+|\d+(?:\.\d*)?(?:px|em|rem|%|vh|vw|deg|s|ms)?)$/.test(trimmed)) return true;
	if (/^\$[\w$]+\s*[=:]/.test(trimmed)) return true;
	if (/\|\s*\w+|\w+\s*\|/.test(trimmed)) return true;
	if (/^(?:git|npm|yarn|pnpm|bun|pip|cargo|go|rust|python|node|java|mvn|gradle|docker|kubectl)\s+/.test(trimmed)) return true;
	if (/(?:console|window|document|Math|JSON|Date|Array|Object|String|Number|Boolean)\.[a-zA-Z]/.test(trimmed)) return true;
	if (/^(?:\/\/|#|\/\*|\*\/|<!--|-->)/.test(trimmed)) return true;
	if (/^(?:<<<|<<\s*['"]?\w+['"]?)/.test(trimmed)) return true;
	return false;
}
function applyFixIndentedCodeBlock(md, options = {}) {
	if (options.enabled === false) return;
	md.core.ruler.after("inline", "fix_indented_code_block", (state) => {
		const tokens = state.tokens ?? [];
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i];
			if (token.type !== "code_block") continue;
			const content = String(token.content ?? "").trim();
			if (!content) continue;
			const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
			if (lines.length === 1 && !looksLikeCode(lines[0] ?? "")) {
				const textContent = lines[0] ?? "";
				const level = token.level ?? 0;
				tokens.splice(i, 1, {
					type: "paragraph_open",
					tag: "p",
					nesting: 1,
					level
				}, {
					type: "inline",
					tag: "",
					nesting: 0,
					level,
					content: textContent,
					children: [{
						type: "text",
						content: textContent,
						level: level + 1,
						raw: textContent
					}],
					block: true
				}, {
					type: "paragraph_close",
					tag: "p",
					nesting: -1,
					level
				});
				i += 2;
			}
		}
	});
}

//#endregion
//#region src/parser/linkifyHeuristics.ts
const FILENAMEISH_EXTENSION_RE = /\.([a-z0-9]{1,15})$/i;
const FILENAMEISH_SEGMENT_RE = /[_()[\]{}<>]/u;
const URL_PREFIX_HINT_RE = /^(?:https?:\/\/|ftp:\/\/|mailto:|www\.)/i;
const URL_QUERY_OR_AUTH_HINT_RE = /[?#@]/u;
const PATH_SEPARATOR_RE = /[\\/]/u;
const DOMAINISH_TEXT_RE = /^[\p{L}\p{N}./\\-]+$/u;
const DOMAIN_LABEL_RE = /^[A-Za-z0-9-]{1,63}$/u;
const PUNYCODE_TLD_RE = /^xn--[a-z0-9-]{2,59}$/i;
const MARKET_TICKER_SYMBOL_RE = /^(?:[A-Z]{1,6}|\d{1,8})$/u;
const MARKET_TICKER_CONTEXT_SYMBOL_RE = /^(?=.{1,12}$)[A-Z0-9]+(?:[-.][A-Z0-9]+)*$/iu;
const EXPLICIT_FILENAME_CONTEXT_RE = /文件名\s*[:：]?|附件\s*[:：]?|路径\s*[:：]?|路徑\s*[:：]?|文件列表\s*[:：]?|文档列表\s*[:：]?|文檔列表\s*[:：]?|\bfile\s*names?\b\s*[:：]?|\battachments?\b\s*[:：]?|\bpaths?\b\s*[:：]?|\bfile\s+lists?\b\s*[:：]?|\bdocument\s+lists?\b\s*[:：]?/iu;
const FILENAME_CONTEXT_RE = /文件名\s*[:：]?|文件\s*[:：]?|附件\s*[:：]?|档案\s*[:：]?|檔案\s*[:：]?|文档\s*[:：]?|文檔\s*[:：]?|资料\s*[:：]?|資料\s*[:：]?|路径\s*[:：]?|路徑\s*[:：]?|\bfile\s*name\b\s*[:：]?|\battachments?\b\s*[:：]?|\bfiles?\b\s*[:：]?|\bdocuments?\b\s*[:：]?|\bdocs?\b\s*[:：]?|\bpaths?\b\s*[:：]?/iu;
const MARKET_TICKER_CONTEXT_RE = /股票代码|股票代碼|证券代码|證券代碼|(?:代码|代碼|交易所|后缀|後綴|市场|市場)(?=$|[\s:：/|,，、()（）])|\btickers?\b|\bsymbols?\b|\bexchanges?\b/iu;
const AMBIGUOUS_BARE_DOMAIN_EXTENSIONS = new Set([
	"ai",
	"md",
	"py",
	"rs",
	"sh",
	"zip"
]);
const MARKET_TICKER_SUFFIXES = new Set([
	"as",
	"bj",
	"de",
	"hk",
	"l",
	"ln",
	"ny",
	"pa",
	"sh",
	"ss",
	"sz",
	"t",
	"us"
]);
const MARKET_TICKER_CONTEXT_SUFFIXES = new Set([
	...MARKET_TICKER_SUFFIXES,
	"at",
	"ax",
	"cn",
	"co",
	"it",
	"jp",
	"ks",
	"mc",
	"mx",
	"nz",
	"pl",
	"sa",
	"si",
	"to",
	"tw"
]);
const EXPLICIT_FILENAME_CONTEXT_ONLY_EXTENSIONS = new Set([
	"com",
	"dev",
	"io",
	"page",
	"site"
]);
const FILENAME_CONTEXT_ONLY_EXTENSIONS = new Set([
	"app",
	"apk",
	"dmg",
	"exe",
	"ipa",
	"lock",
	"log",
	"markdown",
	"webmanifest"
]);
const FILENAMEISH_LINK_EXTENSIONS = new Set([
	"7z",
	"ai",
	"astro",
	"avi",
	"bash",
	"bz2",
	"c",
	"cjs",
	"cpp",
	"cs",
	"csv",
	"doc",
	"docx",
	"fish",
	"flac",
	"gif",
	"go",
	"gz",
	"h",
	"hpp",
	"html",
	"java",
	"jpeg",
	"jpg",
	"js",
	"json",
	"jsx",
	"kt",
	"md",
	"mdx",
	"mjs",
	"mov",
	"mp3",
	"mp4",
	"pdf",
	"php",
	"png",
	"ppt",
	"pptx",
	"ps1",
	"py",
	"rar",
	"rb",
	"rs",
	"sh",
	"sql",
	"svg",
	"swift",
	"svelte",
	"tar",
	"tgz",
	"toml",
	"ts",
	"tsx",
	"txt",
	"vue",
	"wav",
	"webp",
	"xls",
	"xlsx",
	"xml",
	"yaml",
	"yml",
	"zip",
	"zsh"
]);
function hasLinkifyDemotionContext(context) {
	return context?.filename === true || context?.explicitFilename === true || context?.marketTicker === true;
}
function mergeLinkifyDemotionContext(left, right) {
	const merged = {
		filename: left?.filename || right?.filename,
		explicitFilename: left?.explicitFilename || right?.explicitFilename,
		marketTicker: left?.marketTicker || right?.marketTicker
	};
	return hasLinkifyDemotionContext(merged) ? merged : void 0;
}
function withLinkifyDemotionContext(options, context) {
	if (!hasLinkifyDemotionContext(context)) return options;
	const inheritedContext = options?.__linkifyDemotionContext;
	return {
		...options,
		__linkifyDemotionContext: {
			filename: inheritedContext?.filename || context?.filename,
			explicitFilename: inheritedContext?.explicitFilename || context?.explicitFilename,
			marketTicker: inheritedContext?.marketTicker || context?.marketTicker
		}
	};
}
function inferNextBlockLinkifyContext(raw) {
	const context = inferLinkifyDemotionContext(raw);
	return hasLinkifyDemotionContext(context) ? context : void 0;
}
function normalizeStandaloneContinuationText(text$1) {
	return text$1.replace(/^[\s>*_`[\]（(【《"'“‘]+/u, "").replace(/[\s<*_`\]）)】》"'.。；;，,、:：!?！？]+$/u, "");
}
function inferContinuationLinkifyContext(raw, inherited) {
	if (!hasLinkifyDemotionContext(inherited)) return void 0;
	const parts = String(raw ?? "").trim().split(/\s+/u).map(normalizeStandaloneContinuationText).filter(Boolean);
	if (parts.length === 0) return void 0;
	const continuation = {};
	if (inherited?.filename && parts.every((part) => shouldDemoteFilenameLikeLinkify(part, {
		filename: true,
		explicitFilename: inherited.explicitFilename
	}))) continuation.filename = true;
	if (inherited?.explicitFilename && continuation.filename) continuation.explicitFilename = true;
	if (inherited?.marketTicker && parts.every((part) => shouldDemoteFilenameLikeLinkify(part, { marketTicker: true }))) continuation.marketTicker = true;
	return hasLinkifyDemotionContext(continuation) ? continuation : void 0;
}
function createLinkifyDemotionContextTracker(options, sticky = false) {
	let context;
	return {
		options(raw) {
			if (sticky || raw == null) return withLinkifyDemotionContext(options, context);
			return withLinkifyDemotionContext(options, mergeLinkifyDemotionContext(inferNextBlockLinkifyContext(raw), inferContinuationLinkifyContext(raw, context)));
		},
		remember(raw) {
			const nextContext = inferNextBlockLinkifyContext(raw);
			context = sticky ? mergeLinkifyDemotionContext(context, nextContext) : mergeLinkifyDemotionContext(nextContext, inferContinuationLinkifyContext(raw, context));
		},
		reset() {
			context = void 0;
		}
	};
}
function isValidDomainLabel(label) {
	return DOMAIN_LABEL_RE.test(label) && !label.startsWith("-") && !label.endsWith("-");
}
function isPlausibleBareDomain(text$1) {
	const labels = text$1.split(".");
	if (labels.length < 2) return false;
	const tld = labels[labels.length - 1]?.toLowerCase() ?? "";
	if (!(isValidDomainLabel(tld) || PUNYCODE_TLD_RE.test(tld))) return false;
	return labels.every(isValidDomainLabel);
}
function hasNonAsciiText(input) {
	return Array.from(input).some((char) => char.charCodeAt(0) > 127);
}
function getHrefAuthority(href) {
	return href.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split(/[/?#]/, 1)[0] ?? "";
}
function hasPunycodeAuthorityLabel(authority) {
	return authority.split(".").some((label) => label.toLowerCase().startsWith("xn--"));
}
function isDecodedFromRawPunycode(linkText, href, raw) {
	const authority = getHrefAuthority(href);
	return hasNonAsciiText(linkText) && hasPunycodeAuthorityLabel(authority) && String(raw ?? "").toLowerCase().includes(authority.toLowerCase());
}
function inferLinkifyDemotionContext(contextText) {
	const text$1 = String(contextText ?? "");
	return {
		explicitFilename: EXPLICIT_FILENAME_CONTEXT_RE.test(text$1),
		filename: FILENAME_CONTEXT_RE.test(text$1),
		marketTicker: MARKET_TICKER_CONTEXT_RE.test(text$1)
	};
}
function hasDomainAuthorityPrefix(text$1) {
	return isPlausibleBareDomain(text$1.split(/[\\/]/)[0] ?? "");
}
function isUppercaseFilenameSegment(segment) {
	const lettersOnly = segment.replace(/[^a-z]/gi, "");
	return lettersOnly.length >= 2 && lettersOnly === lettersOnly.toUpperCase();
}
function hasStrongFilenameSignals(linkText) {
	if (FILENAMEISH_SEGMENT_RE.test(linkText)) return true;
	if (!DOMAINISH_TEXT_RE.test(linkText)) return true;
	if (PATH_SEPARATOR_RE.test(linkText)) return !hasDomainAuthorityPrefix(linkText);
	const extensionless = linkText.replace(FILENAMEISH_EXTENSION_RE, "");
	if (hasNonAsciiText(extensionless)) return true;
	return extensionless.split(".").filter(Boolean).some(isUppercaseFilenameSegment);
}
function isMarketTickerLikeText(linkText, extension, hasMarketTickerContext) {
	if (!(hasMarketTickerContext ? MARKET_TICKER_CONTEXT_SUFFIXES : MARKET_TICKER_SUFFIXES).has(extension)) return false;
	const symbol = linkText.slice(0, -(extension.length + 1));
	if (symbol === "") return linkText.startsWith(".");
	return (hasMarketTickerContext ? MARKET_TICKER_CONTEXT_SYMBOL_RE : MARKET_TICKER_SYMBOL_RE).test(symbol);
}
function shouldDemoteFilenameLikeLinkify(linkText, context = {}) {
	if (!linkText || URL_PREFIX_HINT_RE.test(linkText) || URL_QUERY_OR_AUTH_HINT_RE.test(linkText)) return false;
	const extensionMatch = linkText.match(FILENAMEISH_EXTENSION_RE);
	if (!extensionMatch) return false;
	const extension = String(extensionMatch[1] ?? "").toLowerCase();
	if (isMarketTickerLikeText(linkText, extension, context.marketTicker === true)) return true;
	if (!FILENAMEISH_LINK_EXTENSIONS.has(extension)) {
		if (context.explicitFilename && EXPLICIT_FILENAME_CONTEXT_ONLY_EXTENSIONS.has(extension)) return true;
		if (context.filename && FILENAME_CONTEXT_ONLY_EXTENSIONS.has(extension)) return true;
		return false;
	}
	if (!AMBIGUOUS_BARE_DOMAIN_EXTENSIONS.has(extension)) return true;
	if (context.filename) return true;
	return hasStrongFilenameSignals(linkText);
}

//#endregion
//#region src/plugins/fixLinkTokens.ts
const LINKIFY_HARD_STOP_CHARS = ["！"];
function textToken(content) {
	return {
		type: "text",
		content,
		raw: content
	};
}
function pushEmOpen(arr, type) {
	if (type === 1) arr.push({
		type: "em_open",
		tag: "em",
		nesting: 1
	});
	else if (type === 2) arr.push({
		type: "strong_open",
		tag: "strong",
		nesting: 1
	});
	else if (type === 3) {
		arr.push({
			type: "strong_open",
			tag: "strong",
			nesting: 1
		});
		arr.push({
			type: "em_open",
			tag: "em",
			nesting: 1
		});
	}
}
function pushEmClose(arr, type) {
	if (type === 1) arr.push({
		type: "em_close",
		tag: "em",
		nesting: -1
	});
	else if (type === 2) arr.push({
		type: "strong_close",
		tag: "strong",
		nesting: -1
	});
	else if (type === 3) {
		arr.push({
			type: "em_close",
			tag: "em",
			nesting: -1
		});
		arr.push({
			type: "strong_close",
			tag: "strong",
			nesting: -1
		});
	}
}
function createLinkToken(text$1, href, loading) {
	let title = "";
	if (href.includes("\"")) {
		const temps = href.split("\"");
		href = temps[0].trim();
		title = temps[1].trim();
	}
	return {
		type: "link",
		loading,
		href,
		title,
		text: text$1,
		children: [{
			type: "text",
			content: text$1,
			raw: text$1
		}],
		raw: String(`[${text$1}](${href})`)
	};
}
function appendToLinkToken(link$1, suffix) {
	if (!link$1 || !suffix) return;
	link$1.href = String(link$1.href ?? "") + suffix;
	link$1.text = String(link$1.text ?? "") + suffix;
	link$1.raw = String(`[${link$1.text}](${link$1.href})`);
	if (Array.isArray(link$1.children) && link$1.children.length) {
		const last = link$1.children[link$1.children.length - 1];
		if (last?.type === "text") {
			last.content = String(last.content ?? "") + suffix;
			last.raw = String(last.raw ?? "") + suffix;
		} else link$1.children.push(textToken(suffix));
	}
}
function firstIndexOfAny(input, chars) {
	let first = -1;
	for (const ch of chars) {
		const idx = input.indexOf(ch);
		if (idx !== -1 && (first === -1 || idx < first)) first = idx;
	}
	return first;
}
function getHrefFromLinkOpen(token) {
	const href = token.attrs?.find((attr) => attr?.[0] === "href")?.[1];
	return typeof href === "string" ? href : "";
}
function setHrefOnLinkOpen(token, href) {
	if (!token) return;
	token.attrs = Array.isArray(token.attrs) ? token.attrs : [];
	const idx = token.attrs.findIndex((attr) => attr?.[0] === "href");
	if (idx >= 0) token.attrs[idx][1] = href;
	else token.attrs.push(["href", href]);
}
function collectLinkifyText(tokens, openIndex, closeIndex) {
	let text$1 = "";
	for (let index = openIndex + 1; index < closeIndex; index++) {
		const token = tokens[index];
		if (token?.type !== "text" || typeof token.content !== "string") return null;
		text$1 += token.content;
	}
	return text$1 || null;
}
function applyFixLinkTokens(md) {
	md.core.ruler.after("inline", "fix_link_tokens", (state) => {
		const toks = state.tokens ?? [];
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			if (t && t.type === "inline" && Array.isArray(t.children)) try {
				t.children = fixLinkToken(t.children, typeof t.content === "string" ? t.content : void 0);
			} catch (e) {
				console.error("[applyFixLinkTokens] failed to fix inline children", e);
			}
		}
	});
}
function fixLinkToken(tokens, raw) {
	if (tokens.length < 3) return tokens;
	if (tokens.some((token) => token.type === "code_inline")) return tokens;
	const linkifyDemotionContext = inferLinkifyDemotionContext(raw);
	for (let i = 0; i <= tokens.length - 1; i++) {
		if (i < 0) i = 0;
		const curToken = tokens[i];
		if (!curToken) break;
		if (curToken.type === "link_open" && (curToken.markup === "linkify" || curToken.markup === "autolink")) {
			let closeIdx = -1;
			for (let j = i + 1; j < tokens.length; j++) if (tokens[j]?.type === "link_close") {
				closeIdx = j;
				break;
			}
			if (closeIdx !== -1) {
				const linkText = collectLinkifyText(tokens, i, closeIdx);
				const href = getHrefFromLinkOpen(curToken);
				if (curToken.markup === "linkify" && linkText && !isDecodedFromRawPunycode(linkText, href, raw) && shouldDemoteFilenameLikeLinkify(linkText, linkifyDemotionContext)) {
					tokens.splice(i, closeIdx - i + 1, textToken(linkText));
					continue;
				}
				const hrefStop = firstIndexOfAny(href, LINKIFY_HARD_STOP_CHARS);
				for (let j = i + 1; j < closeIdx; j++) {
					const t = tokens[j];
					if (t?.type !== "text" || typeof t.content !== "string") continue;
					const stopAt = firstIndexOfAny(t.content, LINKIFY_HARD_STOP_CHARS);
					if (stopAt === -1) continue;
					const stopChar = t.content[stopAt];
					const before = t.content.slice(0, stopAt);
					let tail = t.content.slice(stopAt);
					for (let k = j + 1; k < closeIdx; k++) {
						const tk = tokens[k];
						if (tk?.type === "text" && typeof tk.content === "string") tail += tk.content;
					}
					t.content = before;
					t.raw = before;
					const removeCount = closeIdx - (j + 1);
					if (removeCount > 0) {
						tokens.splice(j + 1, removeCount);
						closeIdx = j + 1;
					}
					let newHref = href;
					if (hrefStop !== -1) newHref = href.slice(0, hrefStop);
					else if (tail) {
						const encodedTail = encodeURI(tail);
						if (encodedTail && href.endsWith(encodedTail)) newHref = href.slice(0, href.length - encodedTail.length);
						else {
							const encodedStop = stopChar ? encodeURI(stopChar) : "";
							const idx = encodedStop ? href.indexOf(encodedStop) : -1;
							if (idx !== -1) newHref = href.slice(0, idx);
						}
					}
					if (newHref !== href) setHrefOnLinkOpen(curToken, newHref);
					if (tail) tokens.splice(closeIdx + 1, 0, textToken(tail));
					break;
				}
			}
		}
		if (curToken?.type === "em_open" && tokens[i - 1]?.type === "text" && tokens[i - 1].content?.endsWith("*")) {
			const beforeText = tokens[i - 1].content?.replace(/(\*+)$/, "") || "";
			tokens[i - 1].content = beforeText;
			curToken.type = "strong_open";
			curToken.tag = "strong";
			curToken.markup = "**";
			for (let j = i + 1; j < tokens.length; j++) if (tokens[j]?.type === "em_close") {
				tokens[j].type = "strong_close";
				tokens[j].tag = "strong";
				tokens[j].markup = "**";
				break;
			}
		} else if (curToken?.type === "text" && curToken.content?.endsWith("(") && tokens[i + 1]?.type === "link_open") {
			const match = curToken.content.match(/\[([^\]]+)\]/);
			if (match) {
				let beforeText = curToken.content.slice(0, match.index);
				const emphasisMatch = beforeText.match(/(\*+)$/);
				const replacerTokens = [];
				if (emphasisMatch) {
					beforeText = beforeText.slice(0, emphasisMatch.index);
					if (beforeText) replacerTokens.push(textToken(beforeText));
					const text$1 = match[1];
					const type = emphasisMatch[1].length;
					pushEmOpen(replacerTokens, type);
					let href = tokens[i + 2]?.content || "";
					if (tokens[i + 4]?.type === "text" && !tokens[i + 4].content?.startsWith(")")) {
						href += tokens[i + 4]?.content || "";
						tokens[i + 4].content = "";
					}
					replacerTokens.push(createLinkToken(text$1, href, !tokens[i + 4]?.content?.startsWith(")")));
					pushEmClose(replacerTokens, type);
					if (tokens[i + 4]?.type === "text") {
						const afterText = tokens[i + 4].content?.replace(/^\)\**/, "");
						if (afterText) replacerTokens.push(textToken(afterText));
						tokens.splice(i, 5, ...replacerTokens);
					} else tokens.splice(i, 4, ...replacerTokens);
				} else {
					if (beforeText) replacerTokens.push(textToken(beforeText));
					let text$1 = match[1];
					const emphasisMatch$1 = text$1.match(/^\*+/);
					if (emphasisMatch$1) {
						const type = emphasisMatch$1[0].length;
						text$1 = text$1.replace(/^\*+/, "").replace(/\*+$/, "");
						let href$1 = tokens[i + 2]?.content || "";
						if (tokens[i + 4]?.type === "text" && !tokens[i + 4].content?.startsWith(")")) {
							href$1 += tokens[i + 4]?.content || "";
							tokens[i + 4].content = "";
						}
						pushEmOpen(replacerTokens, type);
						replacerTokens.push(createLinkToken(text$1, href$1, !tokens[i + 4]?.content?.startsWith(")")));
						pushEmClose(replacerTokens, type);
						if (tokens[i + 4]?.type === "text") {
							const afterText = tokens[i + 4].content?.replace(/^\)/, "");
							if (afterText) replacerTokens.push(textToken(afterText));
							tokens.splice(i, 5, ...replacerTokens);
						} else tokens.splice(i, 4, ...replacerTokens);
						if (i === 0) i = replacerTokens.length - 1;
						else i -= replacerTokens.length + 1;
						continue;
					}
					let href = tokens[i + 2]?.content || "";
					if (tokens[i + 4]?.type === "text" && !tokens[i + 4].content?.startsWith(")")) {
						href += tokens[i + 4]?.content || "";
						tokens[i + 4].content = "";
					}
					replacerTokens.push(createLinkToken(text$1, href, !tokens[i + 4]?.content?.startsWith(")")));
					if (tokens[i + 4]?.type === "text") {
						const afterText = tokens[i + 4].content?.replace(/^\)/, "");
						if (afterText) replacerTokens.push(textToken(afterText));
						tokens.splice(i, 5, ...replacerTokens);
					} else tokens.splice(i, 4, ...replacerTokens);
				}
				i -= replacerTokens.length + 1;
				continue;
			}
		} else if (curToken.type === "link_open" && curToken.markup === "linkify" && tokens[i - 1]?.type === "text" && tokens[i - 1].content?.endsWith("(")) {
			if (tokens[i - 2]?.type === "link_close") {
				const replacerTokens = [];
				const text$1 = tokens[i - 3].content || "";
				let href = curToken.attrs?.find((attr) => attr[0] === "href")?.[1] || "";
				if (tokens[i + 3]?.type === "text") {
					const m = (tokens[i + 3]?.content ?? "").indexOf(")");
					const loading = m === -1;
					if (m === -1) {
						href += tokens[i + 3]?.content?.slice(0, m) || "";
						tokens[i + 3].content = "";
					}
					replacerTokens.push(createLinkToken(text$1, href, loading));
					const afterText = tokens[i + 3].content?.replace(/^\)\**/, "");
					if (afterText) replacerTokens.push(textToken(afterText));
					tokens.splice(i - 4, 8, ...replacerTokens);
				} else {
					replacerTokens.push({
						type: "link",
						loading: true,
						href,
						title: "",
						text: text$1,
						children: [{
							type: "text",
							content: href,
							raw: href
						}],
						raw: String(`[${text$1}](${href})`)
					});
					tokens.splice(i - 4, 7, ...replacerTokens);
				}
				continue;
			} else if (tokens[i - 1].content === "](" && tokens[i - 3]?.type === "text" && tokens[i - 3].content?.endsWith(")")) if (tokens[i - 2]?.type === "strong_open") {
				const [beforeText, linText] = tokens[i - 3].content?.split("[**") || [];
				tokens[i + 1].content = linText || "";
				tokens[i - 3].content = beforeText || "";
				tokens[i - 1].content = "";
			} else if (tokens[i - 2]?.type === "em_open") {
				const [beforeText, linText] = tokens[i - 3].content?.split("[*") || [];
				tokens[i + 1].content = linText || "";
				tokens[i - 3].content = beforeText || "";
				tokens[i - 1].content = "";
			} else {
				const [beforeText, linText] = tokens[i - 3].content?.split("[") || [];
				tokens[i + 1].content = linText || "";
				tokens[i - 3].content = beforeText || "";
				tokens[i - 1].content = "";
			}
		}
		if (curToken.type === "link_close" && curToken.nesting === -1 && tokens[i - 2]?.type === "link_open" && tokens[i + 1]?.type === "text" && tokens[i - 1]?.type === "text") {
			const text$1 = tokens[i - 1].content || "";
			const attrs = tokens[i - 2].attrs || [];
			const href = attrs.find((a) => a[0] === "href")?.[1] || "";
			const title = attrs.find((a) => a[0] === "title")?.[1] || "";
			let count = 3;
			let deleteCount = 2;
			const emphasisMatch = (tokens[i - 3]?.content || "").match(/^(\*+)$/);
			const replacerTokens = [];
			if (emphasisMatch) {
				deleteCount += 1;
				const type = emphasisMatch[1].length;
				pushEmOpen(replacerTokens, type);
			}
			if (curToken.markup !== "linkify" && tokens[i + 1].type === "text" && tokens[i + 1]?.content?.startsWith("](")) {
				count += 1;
				for (let j = i + 1; j < tokens.length; j++) {
					const type = emphasisMatch ? emphasisMatch[1].length : tokens[i - 3].markup.length;
					const t = tokens[j];
					if (type === 1 && t.type === "em_close") break;
					else if (type === 2 && t.type === "strong_close") break;
					else if (type === 3) {
						if (t.type === "em_close" || t.type === "strong_close") break;
					}
					count += 1;
				}
			}
			const linkToken = {
				type: "link",
				loading: false,
				href,
				title,
				text: text$1,
				children: [{
					type: "text",
					content: text$1,
					raw: text$1
				}],
				raw: String(`[${text$1}](${href})`)
			};
			replacerTokens.push(linkToken);
			if (emphasisMatch) {
				const type = emphasisMatch[1].length;
				pushEmClose(replacerTokens, type);
			}
			tokens.splice(i - deleteCount, count, ...replacerTokens);
			i -= replacerTokens.length + 1;
			continue;
		} else if (curToken.content?.startsWith("](") && tokens[i - 1].markup?.includes("*") && tokens[i - 4]?.type === "text" && tokens[i - 4].content?.endsWith("[")) {
			const type = tokens[i - 1].markup.length;
			const replacerTokens = [];
			const beforeText = tokens[i - 4].content.slice(0, tokens[i - 4].content.length - type);
			if (beforeText) replacerTokens.push(textToken(beforeText));
			pushEmOpen(replacerTokens, type);
			const text$1 = tokens[i - 2].content || "";
			let href = curToken.content.slice(2);
			let loading = true;
			if (tokens[i + 1]?.type === "text") {
				const m = (tokens[i + 1]?.content ?? "").indexOf(")");
				loading = m === -1;
				if (m === -1) {
					href += tokens[i + 1]?.content?.slice(0, m) || "";
					tokens[i + 1].content = "";
				}
			}
			replacerTokens.push(createLinkToken(text$1, href, loading));
			pushEmClose(replacerTokens, type);
			if (tokens[i + 1]?.type === "text") {
				const afterText = tokens[i + 1].content?.replace(/^\)\**/, "");
				if (afterText) replacerTokens.push(textToken(afterText));
				tokens.splice(i - 4, 8, ...replacerTokens);
			} else if (tokens[i + 1]?.type === "link_open") tokens.splice(i - 4, 10, ...replacerTokens);
			else tokens.splice(i - 4, 7, ...replacerTokens);
			i -= replacerTokens.length + 1;
			continue;
		} else if (curToken.content?.startsWith("](") && tokens[i - 1].type === "strong_close" && tokens[i - 4]?.type === "text" && tokens[i - 4]?.content?.includes("**[")) {
			const replacerTokens = [];
			const beforeText = tokens[i - 4].content.split("**[")[0];
			if (beforeText) replacerTokens.push(textToken(beforeText));
			pushEmOpen(replacerTokens, 2);
			const text$1 = tokens[i - 2].content || "";
			let href = curToken.content.slice(2);
			let loading = true;
			if (tokens[i + 1]?.type === "text") {
				const m = (tokens[i + 1]?.content ?? "").indexOf(")");
				loading = m === -1;
				if (m === -1) {
					href += tokens[i + 1]?.content?.slice(0, m) || "";
					tokens[i + 1].content = "";
				}
			}
			replacerTokens.push(createLinkToken(text$1, href, loading));
			pushEmClose(replacerTokens, 2);
			if (tokens[i + 1]?.type === "text") {
				const afterText = tokens[i + 1].content?.replace(/^\)\**/, "");
				if (afterText) replacerTokens.push(textToken(afterText));
				tokens.splice(i - 4, 8, ...replacerTokens);
			} else if (tokens[i + 1]?.type === "link_open") tokens.splice(i - 4, 10, ...replacerTokens);
			else tokens.splice(i - 4, 7, ...replacerTokens);
			i -= replacerTokens.length + 1;
			continue;
		} else if (curToken.type === "strong_close" && tokens[i + 1]?.type === "text" && tokens[i + 1].content?.includes("](") && tokens[i - 1].type === "text" && /\[.*$/.test(tokens[i - 1].content || "")) {
			const replacerTokens = [];
			const [beforeText, afterText] = tokens[i - 1].content?.split("[") || ["", ""];
			if (beforeText) replacerTokens.push(textToken(beforeText));
			pushEmOpen(replacerTokens, 2);
			let [text$1, href] = tokens[i + 1].content.split("](");
			text$1 = afterText + text$1;
			let deleteCount = 4;
			if (tokens[i + 2]?.type === "link_open") {
				const _href = tokens[i + 2].attrs?.find((a) => a[0] === "href")?.[1];
				if (tokens[i + 5]?.type === "text" && tokens[i + 5].content === ".") {
					href = (_href || href) + tokens[i + 5].content;
					tokens[i + 5].content = "";
				} else href = _href || href;
				deleteCount += 3;
			}
			let loading = true;
			if (curToken.nesting === -1) text$1 = text$1.replace(/\*+$/, "");
			if (tokens[i + 2]?.type === "text") {
				const m = (tokens[i + 2]?.content ?? "").indexOf(")");
				loading = m === -1;
				if (m === -1) {
					href += tokens[i + 2]?.content?.slice(0, m) || "";
					tokens[i + 2].content = "";
				}
			}
			replacerTokens.push(createLinkToken(text$1, href, loading));
			pushEmClose(replacerTokens, 2);
			tokens.splice(i - 2, deleteCount, ...replacerTokens);
		}
		if (curToken.type === "text" && /\*+\[[^\]]*$/.test(curToken.content || "") && tokens[i + 1]?.type === "strong_open" && tokens[i + 2]?.type === "text" && tokens[i + 2].content === "](" && tokens[i + 3]?.type === "link_open" && tokens[i + 5]?.type === "link_close" && tokens[i + 6]?.type === "text" && tokens[i + 6].content === ")" && tokens[i + 7]?.type === "strong_close") {
			const startMatch = (curToken.content || "").match(/^(\*+)\[(.*)$/);
			if (startMatch) {
				const finalLabel = (startMatch[2] || "") + startMatch[1];
				let href = tokens[i + 3]?.attrs?.find((a) => a[0] === "href")?.[1] || "";
				if (!href && tokens[i + 4]?.type === "text") href = tokens[i + 4].content || "";
				const out = [];
				pushEmOpen(out, 2);
				out.push(createLinkToken(finalLabel, href, false));
				pushEmClose(out, 2);
				tokens.splice(i, 9, ...out);
				i -= out.length - 1;
				continue;
			}
		}
	}
	for (let i = 0; i < tokens.length - 1; i++) {
		const t = tokens[i];
		const next = tokens[i + 1];
		if (t?.type !== "link" || next?.type !== "text" || typeof next.content !== "string") continue;
		if (!next.content.startsWith("!")) continue;
		const href = String(t.href ?? "");
		if (String(t.text ?? "") !== href) continue;
		if (!href.endsWith("=") && !href.endsWith("#")) continue;
		appendToLinkToken(t, "!");
		const rest = next.content.slice(1);
		if (rest) {
			next.content = rest;
			next.raw = rest;
		} else tokens.splice(i + 1, 1);
	}
	return tokens;
}

//#endregion
//#region src/plugins/fixListItem.ts
function applyFixListItem(md) {
	md.core.ruler.after("inline", "fix_list_item_tokens", (state) => {
		const toks = state.tokens ?? [];
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			if (t && t.type === "inline" && Array.isArray(t.children)) try {
				t.children = fixListItem(t.children);
			} catch (e) {
				console.error("[applyFixListItem] failed to fix inline children", e);
			}
		}
	});
}
function fixListItem(tokens) {
	const last = tokens[tokens.length - 1];
	const lastContent = String(last?.content ?? "");
	if (last?.type === "text" && /^\s*\d+\.\s*$/.test(lastContent) && tokens[tokens.length - 2]?.tag === "br") tokens.splice(tokens.length - 1, 1);
	return tokens;
}

//#endregion
//#region src/plugins/fixStrongTokens.ts
function applyFixStrongTokens(md) {
	md.core.ruler.after("inline", "fix_strong_tokens", (state) => {
		const toks = state.tokens ?? [];
		for (let i = 0; i < toks.length; i++) {
			const t = toks[i];
			if (t && t.type === "inline" && Array.isArray(t.children)) try {
				t.children = fixStrongTokens(t.children);
			} catch (e) {
				console.error("[applyFixStrongTokens] failed to fix inline children", e);
			}
		}
	});
}
function fixStrongTokens(tokens) {
	let strongIndex = 0;
	const cleansStrong = /* @__PURE__ */ new Set();
	const cleansEm = /* @__PURE__ */ new Set();
	let emIndex = 0;
	for (let i$1 = 0; i$1 < tokens.length; i$1++) {
		const t = tokens[i$1];
		const type = t.type;
		if (type === "strong_open") {
			strongIndex++;
			const markup = String(t.markup ?? "");
			let j = i$1 - 1;
			while (j >= 0 && tokens[j].type === "text" && tokens[j].content === "") j--;
			const preToken = tokens[j];
			let k = i$1 + 1;
			while (k < tokens.length && tokens[k].type === "text" && tokens[k].content === "") k++;
			const postToken = tokens[k];
			if (markup === "__" && (preToken?.content?.endsWith("_") || postToken?.content?.startsWith("_") || postToken?.markup?.includes("_"))) {
				t.type = "text";
				t.tag = "";
				t.content = markup;
				t.raw = markup;
				t.markup = "";
				t.attrs = null;
				t.map = null;
				t.info = "";
				t.meta = null;
				cleansStrong.add(strongIndex);
			}
		} else if (type === "strong_close") {
			if (cleansStrong.has(strongIndex) && t.markup === "__") {
				t.type = "text";
				t.content = t.markup;
				t.raw = String(t.markup ?? "");
				t.tag = "";
				t.markup = "";
				t.attrs = null;
				t.map = null;
				t.info = "";
				t.meta = null;
			}
			strongIndex--;
			if (strongIndex < 0) strongIndex = 0;
		} else if (type === "em_open") {
			emIndex++;
			const markup = String(t.markup ?? "");
			let j = i$1 - 1;
			while (j >= 0 && tokens[j].type === "text" && tokens[j].content === "") j--;
			const preToken = tokens[j];
			let k = i$1 + 1;
			while (k < tokens.length && tokens[k].type === "text" && tokens[k].content === "") k++;
			const postToken = tokens[k];
			if (markup === "_" && (preToken?.content?.endsWith("_") || postToken?.content?.startsWith("_") || postToken?.markup?.includes("_"))) {
				t.type = "text";
				t.tag = "";
				t.content = markup;
				t.raw = markup;
				t.markup = "";
				t.attrs = null;
				t.map = null;
				t.info = "";
				t.meta = null;
				cleansEm.add(emIndex);
			}
		} else if (type === "em_close") {
			if (cleansEm.has(emIndex) && t.markup === "_") {
				t.type = "text";
				t.content = t.markup;
				t.raw = String(t.markup ?? "");
				t.tag = "";
				t.markup = "";
				t.attrs = null;
				t.map = null;
				t.info = "";
				t.meta = null;
			}
			emIndex--;
			if (emIndex < 0) emIndex = 0;
		}
	}
	if (tokens.length < 5) return tokens;
	const i = tokens.length - 4;
	const token = tokens[i];
	let fixedTokens = [...tokens];
	const nextToken = tokens[i + 1];
	const tokenContent = String(token.content ?? "");
	if (token.type === "link_open" && tokens[i - 1]?.type === "em_open" && tokens[i - 2]?.type === "text" && tokens[i - 2].content?.endsWith("*")) {
		const textContent = String(tokens[i - 2].content ?? "").slice(0, -1);
		const replaceTokens = [
			{
				type: "strong_open",
				tag: "strong",
				attrs: null,
				map: null,
				children: null,
				content: "",
				markup: "**",
				info: "",
				meta: null,
				raw: ""
			},
			tokens[i],
			tokens[i + 1],
			tokens[i + 2],
			{
				type: "strong_close",
				tag: "strong",
				attrs: null,
				map: null,
				children: null,
				content: "",
				markup: "**",
				info: "",
				meta: null,
				raw: ""
			}
		];
		if (textContent) replaceTokens.unshift({
			type: "text",
			content: textContent,
			raw: textContent
		});
		fixedTokens.splice(i - 2, 6, ...replaceTokens);
	} else if (token.type === "text" && tokenContent.endsWith("*") && nextToken.type === "em_open") {
		const _nextToken = tokens[i + 2];
		const count = _nextToken?.type === "text" ? 4 : 3;
		const insert = [
			{
				type: "strong_open",
				tag: "strong",
				attrs: null,
				map: null,
				children: null,
				content: "",
				markup: "**",
				info: "",
				meta: null,
				raw: ""
			},
			{
				type: "text",
				content: _nextToken?.type === "text" ? String(_nextToken.content ?? "") : "",
				raw: _nextToken?.type === "text" ? String(_nextToken.content ?? "") : ""
			},
			{
				type: "strong_close",
				tag: "strong",
				attrs: null,
				map: null,
				children: null,
				content: "",
				markup: "**",
				info: "",
				meta: null,
				raw: ""
			}
		];
		const beforeText = tokenContent.slice(0, -1);
		if (beforeText) insert.unshift({
			type: "text",
			content: beforeText,
			raw: beforeText
		});
		fixedTokens.splice(i, count, ...insert);
	}
	fixedTokens = mergeBrokenStrongAroundMathInline(fixedTokens);
	return fixedTokens;
}
function mergeBrokenStrongAroundMathInline(tokens) {
	if (tokens.length < 7) return tokens;
	const out = [];
	for (let i = 0; i < tokens.length; i++) {
		const t0 = tokens[i];
		const t1 = tokens[i + 1];
		const t2 = tokens[i + 2];
		const t3 = tokens[i + 3];
		const t4 = tokens[i + 4];
		const t5 = tokens[i + 5];
		const t6 = tokens[i + 6];
		if (t0?.type === "strong_open" && t1?.type === "text" && t2?.type === "strong_close" && t3?.type === "strong_open" && t4?.type === "math_inline" && t5?.type === "strong_close" && t6?.type === "text") {
			const textContent = String(t6.content ?? "");
			const closeIdx = textContent.indexOf("**");
			if (closeIdx !== -1) {
				const beforeClose = textContent.slice(0, closeIdx);
				const afterClose = textContent.slice(closeIdx + 2);
				out.push(t0);
				out.push(t1);
				out.push(t4);
				if (beforeClose) out.push({
					...t6,
					type: "text",
					content: beforeClose,
					raw: beforeClose
				});
				out.push(t5);
				if (afterClose) out.push({
					...t6,
					type: "text",
					content: afterClose,
					raw: afterClose
				});
				i += 6;
				continue;
			}
		}
		if (t0?.type === "strong_open" && t1?.type === "text" && t2?.type === "strong_close" && t3?.type === "strong_open" && t4?.type === "math_inline" && t5?.type === "strong_close") {
			const close = findTrailingTextStrongClose(tokens, i + 6);
			if (close) {
				out.push(t0);
				out.push(t1);
				out.push(t4);
				for (let j = i + 6; j < close.index; j++) out.push(tokens[j]);
				if (close.beforeClose) out.push({
					...tokens[close.index],
					type: "text",
					content: close.beforeClose,
					raw: close.beforeClose
				});
				out.push(t5);
				if (close.afterClose) out.push({
					...tokens[close.index],
					type: "text",
					content: close.afterClose,
					raw: close.afterClose
				});
				i = close.index;
				continue;
			}
		}
		out.push(t0);
	}
	return out;
}
function findTrailingTextStrongClose(tokens, startIndex) {
	for (let i = startIndex; i < tokens.length; i++) {
		const token = tokens[i];
		if (token?.type === "strong_open") return null;
		if (token?.type !== "text") continue;
		const content = String(token.content ?? "");
		const closeIdx = content.indexOf("**");
		if (closeIdx === -1) continue;
		return {
			index: i,
			beforeClose: content.slice(0, closeIdx),
			afterClose: content.slice(closeIdx + 2)
		};
	}
	return null;
}

//#endregion
//#region src/plugins/fixTableTokens.ts
function applyFixTableTokens(md) {
	md.core.ruler.after("block", "fix_table_tokens", (state) => {
		const s = state;
		try {
			const fixed = fixTableTokens(s.tokens ?? [], !!s.env?.__markstreamFinal, s.src ?? "");
			if (Array.isArray(fixed)) s.tokens = fixed;
		} catch (e) {
			console.error("[applyFixTableTokens] failed to fix table tokens", e);
		}
	});
}
function createStart() {
	return [
		{
			type: "table_open",
			tag: "table",
			attrs: null,
			map: null,
			children: null,
			content: "",
			markup: "",
			info: "",
			level: 0,
			loading: true,
			meta: null
		},
		{
			type: "thead_open",
			tag: "thead",
			attrs: null,
			block: true,
			level: 1,
			children: null
		},
		{
			type: "tr_open",
			tag: "tr",
			attrs: null,
			block: true,
			level: 2,
			children: null
		}
	];
}
function createEnd() {
	return [
		{
			type: "tr_close",
			tag: "tr",
			attrs: null,
			block: true,
			level: 2,
			children: null
		},
		{
			type: "thead_close",
			tag: "thead",
			attrs: null,
			block: true,
			level: 1,
			children: null
		},
		{
			type: "table_close",
			tag: "table",
			attrs: null,
			map: null,
			children: null,
			content: "",
			markup: "",
			info: "",
			level: 0,
			meta: null
		}
	];
}
function createTh(text$1) {
	return [
		{
			type: "th_open",
			tag: "th",
			attrs: null,
			block: true,
			level: 3,
			children: null
		},
		{
			type: "inline",
			tag: "",
			children: null,
			content: text$1,
			level: 4,
			attrs: null,
			block: true
		},
		{
			type: "th_close",
			tag: "th",
			attrs: null,
			block: true,
			level: 3,
			children: null
		}
	];
}
function getPipeRowCells(line, requireTrailingPipe) {
	if (!line.startsWith("|") || line.includes("\n")) return null;
	if (requireTrailingPipe && !line.endsWith("|")) return null;
	const cells = line.slice(1).split("|");
	if (cells.at(-1) === "") cells.pop();
	return cells.length > 0 && cells.every((cell) => cell.trim().length > 0) ? cells : null;
}
function hasTrailingPipeHeaderRow(line) {
	return getPipeRowCells(line, true) !== null;
}
function isSeparatorCell(cell) {
	return /^:?-+:?$/.test(cell.trim());
}
function isTableSeparatorRow(line) {
	if (!line.startsWith("|")) return false;
	const cells = line.slice(1).split("|");
	if (cells.at(-1) === "") cells.pop();
	return cells.length > 0 && cells.every(isSeparatorCell);
}
function isPartialSeparatorTail(cell) {
	return /^(?:[:：]-*|:?-+:?)?$/.test(cell.trim());
}
function isTableSeparatorRowWithPartialTail(line) {
	if (line === "") return true;
	if (!line.startsWith("|")) return false;
	const cells = line.slice(1).split("|");
	const tail = cells.at(-1) ?? "";
	return cells.slice(0, -1).every(isSeparatorCell) && isPartialSeparatorTail(tail);
}
function isTruncatedSeparatorRow(line) {
	return line === "|" || line === "|:";
}
function hasTrailingPipeHeaderRowWithoutColon(line) {
	const cells = getPipeRowCells(line, true);
	return cells !== null && cells.every((cell) => !cell.includes(":"));
}
function fixTableTokens(tokens, final = false, source = "") {
	const fixedTokens = [...tokens];
	if (tokens.length < 3) return fixedTokens;
	const i = tokens.length - 2;
	const token = tokens[i];
	if (token.type === "inline") {
		const tcontent = String(token.content ?? "");
		const headerContent = tcontent.split("\n")[0] ?? "";
		const [headerLine = "", separatorLine = "", ...rest] = tcontent.split("\n");
		const hasTrailingNewlineSeparatorStart = !final && !tcontent.includes("\n") && /\r?\n$/.test(source) && hasTrailingPipeHeaderRow(tcontent);
		if (!final && (tcontent.includes("\n") && rest.length === 0 && hasTrailingPipeHeaderRow(headerLine) && isTableSeparatorRowWithPartialTail(separatorLine) || hasTrailingNewlineSeparatorStart)) {
			const body = headerContent.slice(1, -1).split("|").map((i$1) => i$1.trim()).flatMap((i$1) => createTh(i$1));
			const insert = [
				...createStart(),
				...body,
				...createEnd()
			];
			fixedTokens.splice(i - 1, 3, ...insert);
		} else if (tcontent.includes("\n") && rest.length === 0 && hasTrailingPipeHeaderRow(headerLine) && isTableSeparatorRow(separatorLine)) {
			const body = headerContent.slice(1, -1).split("|").map((i$1) => i$1.trim()).flatMap((i$1) => createTh(i$1));
			const insert = [
				...createStart(),
				...body,
				...createEnd()
			];
			fixedTokens.splice(i - 1, 3, ...insert);
		} else if (tcontent.includes("\n") && rest.length === 0 && hasTrailingPipeHeaderRowWithoutColon(headerLine) && isTruncatedSeparatorRow(separatorLine)) {
			token.content = tcontent.slice(0, -2);
			token.children.splice(2, 1);
		}
	}
	return fixedTokens;
}

//#endregion
//#region src/findMatchingClose.ts
function findMatchingClose(src, startIdx, open, close) {
	const len = src.length;
	if (open === "$$" && close === "$$") {
		let i$1 = startIdx;
		while (i$1 < len - 1) {
			if (src[i$1] === "$" && src[i$1 + 1] === "$") {
				let k = i$1 - 1;
				let backslashes = 0;
				while (k >= 0 && src[k] === "\\") {
					backslashes++;
					k--;
				}
				if (backslashes % 2 === 0) return i$1;
			}
			i$1++;
		}
		return -1;
	}
	const openChar = open[open.length - 1];
	const closeSeq = close;
	let depth = 0;
	let i = startIdx;
	while (i < len) {
		if (src.slice(i, i + closeSeq.length) === closeSeq) {
			let k = i - 1;
			let backslashes = 0;
			while (k >= 0 && src[k] === "\\") {
				backslashes++;
				k--;
			}
			if (backslashes % 2 === 0) {
				if (depth === 0) return i;
				depth--;
				i += closeSeq.length;
				continue;
			}
		}
		const ch = src[i];
		if (ch === "\\") {
			i += 2;
			continue;
		}
		if (ch === openChar) depth++;
		else if (ch === closeSeq[closeSeq.length - 1]) {
			if (depth > 0) depth--;
		}
		i++;
	}
	return -1;
}
var findMatchingClose_default = findMatchingClose;

//#endregion
//#region src/plugins/isMathLike.ts
const TEX_BRACE_COMMANDS = [
	"boldsymbol",
	"mathbb",
	"mathcal",
	"mathfrak",
	"mathrm",
	"mathit",
	"mathsf",
	"vec",
	"hat",
	"bar",
	"tilde",
	"overline",
	"underline",
	"mathscr",
	"mathnormal",
	"operatorname",
	"mathbf*"
];
const ESCAPED_TEX_BRACE_COMMANDS = TEX_BRACE_COMMANDS.map((c) => c.replace(/[.*+?^${}()|[\\]"\]/g, "\\$&")).join("|");
const TEX_CMD_RE = /\\[a-z]+/i;
const PREFIX_CLASS = "(?:\\\\|\\u0008)";
const TEX_CMD_WITH_BRACES_RE = new RegExp(String.raw`${PREFIX_CLASS}(?:${ESCAPED_TEX_BRACE_COMMANDS})\s*\{[^}]+\}`, "i");
const TEX_BRACE_CMD_START_RE = new RegExp(String.raw`(?:${PREFIX_CLASS})?(?:${ESCAPED_TEX_BRACE_COMMANDS})\s*\{`, "i");
const TEX_SPECIFIC_RE = /\\(?:text|frac|left|right|times)/;
const OPS_RE = /(?:^|[^+])\+(?!\+)|[=\-*/^<>]|\\times|\\pm|\\cdot|\\le|\\ge|\\neq/;
const HYPHENATED_MULTIWORD_RE = /\b[A-Z]{2,}-[A-Z]{2,}\b/i;
const FUNC_CALL_RE = /[A-Z]+\s*\([^)]+\)/i;
const PAREN_VARIABLE_TUPLE_RE = /^\(\s*[a-z](?:\s*,\s*[a-z])+\s*\)$/i;
const WORDS_RE = /\b(?:sin|cos|tan|log|ln|exp|sqrt|frac|sum|lim|int|prod)\b/;
const DATE_TIME_RE = /\b\d{4}\/\d{1,2}\/\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b/;
const CONTROL_TEX_REPLACEMENTS = {
	[String.fromCharCode(8)]: "\\b",
	[String.fromCharCode(11)]: "\\v",
	[String.fromCharCode(12)]: "\\f"
};
function normalizeMathControlChars(value) {
	let result = "";
	for (const ch of value) result += CONTROL_TEX_REPLACEMENTS[ch] ?? ch;
	return result;
}
function isMathLike(s) {
	if (!s) return false;
	const norm = normalizeMathControlChars(s);
	const stripped = norm.trim();
	if (DATE_TIME_RE.test(stripped)) return false;
	if (stripped.includes("**")) return false;
	if (stripped.length > 2e3) return true;
	const texCmd = TEX_CMD_RE.test(norm);
	const texCmdWithBraces = TEX_CMD_WITH_BRACES_RE.test(norm);
	const texBraceStart = TEX_BRACE_CMD_START_RE.test(norm);
	const texSpecific = TEX_SPECIFIC_RE.test(norm);
	const superSub = /(?:^|[^\w\\])(?:[A-Z]|\\[A-Z]+)_(?:\{[^}]+\}|[A-Z0-9\\])/i.test(norm) || /(?:^|[^\w\\])(?:[A-Z]|\\[A-Z]+)\^(?:\{[^}]+\}|[A-Z0-9\\])/i.test(norm);
	const ops = OPS_RE.test(norm) && !HYPHENATED_MULTIWORD_RE.test(norm);
	const funcCall = FUNC_CALL_RE.test(norm);
	const variableTuple = PAREN_VARIABLE_TUPLE_RE.test(stripped);
	const words = WORDS_RE.test(norm);
	const pureWord = /^\([a-z]\)$/i.test(stripped) || /^(?:[a-z]|pi)$/i.test(stripped);
	const chemicalLike = /^(?:[A-Z][a-z]?(?:_\{?\d+\}?|\^\{?\d+\}?)?)+$/.test(stripped);
	return texCmd || texCmdWithBraces || texBraceStart || texSpecific || superSub || ops || funcCall || variableTuple || words || pureWord || chemicalLike;
}

//#endregion
//#region src/plugins/math.ts
const MARKSTREAM_MATH_PLUGIN_APPLIED = "__markstreamMathPluginApplied";
const TOLERANT_BOUNDARY_SCAN_MAX_LINES = 80;
const TOLERANT_BOUNDARY_SCAN_MAX_CHARS = 2e4;
const TOLERANT_BOUNDARY_SCAN_TAIL_CHARS = TOLERANT_BOUNDARY_SCAN_MAX_CHARS + 4096;
function hasMarkstreamMathPlugin(md) {
	return !!md[MARKSTREAM_MATH_PLUGIN_APPLIED];
}
function markMarkstreamMathPluginApplied(md) {
	md[MARKSTREAM_MATH_PLUGIN_APPLIED] = true;
}
const KATEX_COMMANDS = [
	"ldots",
	"cdots",
	"quad",
	"in",
	"displaystyle",
	"int_",
	"lim",
	"lim_",
	"ce",
	"pu",
	"end",
	"infty",
	"perp",
	"mid",
	"operatorname",
	"to",
	"rightarrow",
	"leftarrow",
	"math",
	"mathrm",
	"mathit",
	"mathbb",
	"mathcal",
	"mathfrak",
	"implies",
	"alpha",
	"beta",
	"gamma",
	"delta",
	"epsilon",
	"lambda",
	"sum",
	"sum_",
	"prod",
	"sqrt",
	"fbox",
	"boxed",
	"color",
	"rule",
	"edef",
	"fcolorbox",
	"hline",
	"hdashline",
	"cdot",
	"times",
	"pm",
	"le",
	"ge",
	"neq",
	"sin",
	"cos",
	"tan",
	"log",
	"ln",
	"exp",
	"frac",
	"text",
	"left",
	"right"
];
const ANY_COMMANDS = [
	"cdot",
	"mathbf{",
	"partial",
	"mu_{"
];
const ESCAPED_KATEX_COMMANDS = KATEX_COMMANDS.slice().sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\\]\\\]/g, "\\$&")).join("|");
const CONTROL_CHARS_CLASS = "[	\r\b\f\v]";
const ESCAPED_MKATWX_COMMANDS = new RegExp(`([^\\\\])(${ANY_COMMANDS.map((c) => c).join("|")})+`, "g");
const SPAN_CURLY_RE = /span\{([^}]+)\}/;
const OPERATORNAME_SPAN_RE = /\\operatorname\{span\}\{((?:[^{}]|\{[^}]*\})+)\}/;
const SINGLE_BACKSLASH_NEWLINE_RE = /(^|[^\\])\\\r?\n/g;
const ENDING_SINGLE_BACKSLASH_RE = /(^|[^\\])\\$/g;
const DEFAULT_MATH_RE = new RegExp(`(${CONTROL_CHARS_CLASS})|(${ESCAPED_KATEX_COMMANDS})\\b`, "g");
const MATH_RE_CACHE = /* @__PURE__ */ new Map();
const BRACE_CMD_RE_CACHE = /* @__PURE__ */ new Map();
function getMathRegex(commands) {
	if (!commands) return DEFAULT_MATH_RE;
	const arr = [...commands];
	arr.sort((a, b) => b.length - a.length);
	const key = arr.join("");
	const cached = MATH_RE_CACHE.get(key);
	if (cached) return cached;
	const commandPattern = `(?:${arr.map((c) => c.replace(/[.*+?^${}()|[\\]\\"\]/g, "\\$&")).join("|")})`;
	const re = new RegExp(`(${CONTROL_CHARS_CLASS})|(${commandPattern})\\b`, "g");
	MATH_RE_CACHE.set(key, re);
	return re;
}
function getBraceCmdRegex(useDefault, commands) {
	const arr = useDefault ? [] : [...commands ?? []];
	if (!useDefault) arr.sort((a, b) => b.length - a.length);
	const key = useDefault ? "__default__" : arr.join("");
	const cached = BRACE_CMD_RE_CACHE.get(key);
	if (cached) return cached;
	const braceEscaped = useDefault ? [ESCAPED_TEX_BRACE_COMMANDS, ESCAPED_KATEX_COMMANDS].filter(Boolean).join("|") : [arr.map((c) => c.replace(/[.*+?^${}()|[\\]\\\]/g, "\\$&")).join("|"), ESCAPED_TEX_BRACE_COMMANDS].filter(Boolean).join("|");
	const re = new RegExp(`(^|[^\\\\\\w])(${braceEscaped})\\s*\\{`, "g");
	BRACE_CMD_RE_CACHE.set(key, re);
	return re;
}
const CONTROL_MAP = {
	"	": "t",
	"\r": "r",
	"\b": "b",
	"\f": "f",
	"\v": "v"
};
function countUnescapedStrong(s) {
	const re = /(^|[^\\])(__|\*\*)/g;
	let c = 0;
	while (re.exec(s) !== null) c++;
	return c;
}
function findLastUnescapedStrongMarker(s) {
	const re = /(^|[^\\])(__|\*\*)/g;
	let m;
	let last = null;
	while ((m = re.exec(s)) !== null) last = {
		marker: m[2],
		index: m.index + (m[1]?.length ?? 0)
	};
	return last;
}
function normalizeStandaloneBackslashT(s, opts) {
	const commands = opts?.commands ?? KATEX_COMMANDS;
	const escapeExclamation = opts?.escapeExclamation ?? true;
	const useDefault = opts?.commands == null;
	const re = getMathRegex(useDefault ? void 0 : commands);
	let out = s.replace(re, (m, control, cmd, offset, str) => {
		if (control !== void 0 && CONTROL_MAP[control] !== void 0) return `\\${CONTROL_MAP[control]}`;
		if (cmd && commands.includes(cmd)) {
			const prev = str && typeof offset === "number" ? str[offset - 1] : void 0;
			if (prev === "\\" || prev && /\w/.test(prev)) return m;
			return `\\${cmd}`;
		}
		return m;
	});
	if (escapeExclamation) out = out.replace(/(^|[^\\])!/g, "$1\\!");
	let result = out;
	const braceCmdRe = getBraceCmdRegex(useDefault, useDefault ? void 0 : commands);
	result = result.replace(braceCmdRe, (_m, p1, p2) => `${p1}\\${p2}{`);
	result = result.replace(SPAN_CURLY_RE, "span\\{$1\\}").replace(OPERATORNAME_SPAN_RE, "\\operatorname{span}\\{$1\\}");
	result = result.replace(SINGLE_BACKSLASH_NEWLINE_RE, "$1\\\\\n");
	result = result.replace(ENDING_SINGLE_BACKSLASH_RE, "$1\\\\");
	result = result.replace(ESCAPED_MKATWX_COMMANDS, "$1\\$2");
	return result;
}
function isPlainBracketMathLike(content) {
	const stripped = content.trim();
	if (!isMathLike(stripped)) return false;
	if (/"[^"\n]{1,80}"\s*:\s*/.test(stripped)) return false;
	if (!(/\\[a-z]+/i.test(stripped) || /[=+*/^<>]|\\times|\\pm|\\cdot|\\le|\\ge|\\neq/.test(stripped) || /[_^]/.test(stripped)) && /\s-\s/.test(stripped)) return false;
	return true;
}
function buildCodeSpanRanges(src) {
	const ranges = [];
	let i = 0;
	while (i < src.length) {
		if (src[i] !== "`") {
			i++;
			continue;
		}
		const openStart = i;
		let openLen = 1;
		while (openStart + openLen < src.length && src[openStart + openLen] === "`") openLen++;
		let j = openStart + openLen;
		let closeStart = -1;
		while (j < src.length) {
			if (src[j] !== "`") {
				j++;
				continue;
			}
			let runLen = 1;
			while (j + runLen < src.length && src[j + runLen] === "`") runLen++;
			if (runLen === openLen) {
				closeStart = j;
				break;
			}
			j += runLen;
		}
		if (closeStart !== -1) {
			ranges.push([openStart, closeStart + openLen]);
			i = closeStart + openLen;
			continue;
		}
		i = openStart + openLen;
	}
	return ranges;
}
function findRangeAt(ranges, index) {
	for (const range of ranges) if (index >= range[0] && index < range[1]) return range;
	return null;
}
function buildImageRanges(src, allowIncomplete = false) {
	const ranges = [];
	let i = 0;
	while (i < src.length - 1) {
		if (src[i] === "!" && src[i + 1] === "[") {
			const start = i;
			let j = i + 2;
			let labelDepth = 1;
			while (j < src.length && labelDepth > 0) {
				if (src[j] === "\\" && j + 1 < src.length) {
					j += 2;
					continue;
				}
				if (src[j] === "[") labelDepth++;
				else if (src[j] === "]") labelDepth--;
				j++;
			}
			if (labelDepth === 0 && j < src.length && src[j] === "(") {
				let k = j + 1;
				let depth = 1;
				while (k < src.length && depth > 0) {
					if (src[k] === "\\" && k + 1 < src.length) {
						k += 2;
						continue;
					}
					if (src[k] === "(") depth++;
					else if (src[k] === ")") depth--;
					k++;
				}
				if (depth === 0) {
					ranges.push([start, k]);
					i = k;
					continue;
				}
				if (allowIncomplete) {
					ranges.push([start, src.length]);
					i = src.length;
					continue;
				}
			}
		}
		i++;
	}
	return ranges;
}
function isEscapedAt(src, index) {
	let cursor = index - 1;
	let backslashes = 0;
	while (cursor >= 0 && src[cursor] === "\\") {
		backslashes++;
		cursor--;
	}
	return backslashes % 2 === 1;
}
function findNextUnescapedDollar(src, startIdx) {
	let searchPos = startIdx;
	while (searchPos < src.length) {
		const index = src.indexOf("$", searchPos);
		if (index === -1) return -1;
		if (isEscapedAt(src, index)) {
			searchPos = index + 1;
			continue;
		}
		return index;
	}
	return -1;
}
function findSingleDollarClose(src, startIdx) {
	let searchPos = startIdx;
	while (searchPos < src.length) {
		const index = findNextUnescapedDollar(src, searchPos);
		if (index === -1) return -1;
		if (index > 0 && src[index - 1] === "$" || index + 1 < src.length && src[index + 1] === "$") {
			searchPos = index + 1;
			continue;
		}
		return index;
	}
	return -1;
}
function findUnescapedDelimiter(src, delimiter$1, startIdx = 0) {
	let searchPos = Math.max(0, startIdx);
	while (searchPos < src.length) {
		const index = src.indexOf(delimiter$1, searchPos);
		if (index === -1) return -1;
		if (!isEscapedAt(src, index)) return index;
		searchPos = index + Math.max(1, delimiter$1.length);
	}
	return -1;
}
function countUnescapedDelimiter(src, delimiter$1, startIdx = 0, endIdx = src.length, excludedRanges = []) {
	let count = 0;
	let searchPos = Math.max(0, startIdx);
	const end = Math.min(src.length, Math.max(0, endIdx));
	while (searchPos < end) {
		const index = src.indexOf(delimiter$1, searchPos);
		if (index === -1 || index >= end) break;
		const excluded = findRangeAt(excludedRanges, index);
		if (excluded) {
			searchPos = Math.max(index + Math.max(1, delimiter$1.length), excluded[1]);
			continue;
		}
		if (!isEscapedAt(src, index)) count++;
		searchPos = index + Math.max(1, delimiter$1.length);
	}
	return count;
}
function getTolerantBoundaryLineEndOpenIndex(line, openDelim, closeDelim) {
	const source = trimRightSpaceOrTab(String(line ?? ""));
	if (!source.endsWith(openDelim)) return -1;
	const openIndex = source.length - openDelim.length;
	if (openIndex <= 0) return -1;
	if (!trimRightSpaceOrTab(source.slice(0, openIndex)).trim()) return -1;
	if (isEscapedAt(source, openIndex)) return -1;
	const codeSpanRanges = buildCodeSpanRanges(source);
	if (findRangeAt(codeSpanRanges, openIndex)) return -1;
	const previousOpenCount = countUnescapedDelimiter(source, openDelim, 0, openIndex, codeSpanRanges);
	if (openDelim === "$$") {
		if (previousOpenCount % 2 === 1) return -1;
	} else if (previousOpenCount > countUnescapedDelimiter(source, closeDelim, 0, openIndex, codeSpanRanges)) return -1;
	return openIndex;
}
function isSpaceOrTab(ch) {
	return ch === " " || ch === "	";
}
function trimRightSpaceOrTab(value) {
	let end = value.length;
	while (end > 0 && isSpaceOrTab(value[end - 1])) end--;
	return value.slice(0, end);
}
function countLineBreaks(value) {
	let count = 0;
	for (let index = 0; index < value.length; index++) if (value[index] === "\n") count++;
	return count;
}
function isAsciiDigit(ch) {
	if (!ch) return false;
	const code$1 = ch.charCodeAt(0);
	return code$1 >= 48 && code$1 <= 57;
}
function isThematicLikeLine(trimmed) {
	if (trimmed.length < 3) return false;
	const marker = trimmed[0];
	if (marker !== "-" && marker !== "*" && marker !== "_" && marker !== "=") return false;
	let markerCount = 0;
	for (let index = 0; index < trimmed.length; index++) {
		const ch = trimmed[index];
		if (ch === marker) {
			markerCount++;
			continue;
		}
		if (isSpaceOrTab(ch)) continue;
		return false;
	}
	return markerCount >= 3;
}
function isMarkdownTableDelimiterCell(cell) {
	const value = cell.trim();
	if (!value) return false;
	let index = 0;
	if (value[index] === ":") index++;
	let dashCount = 0;
	while (value[index] === "-") {
		dashCount++;
		index++;
	}
	if (dashCount < 3) return false;
	if (value[index] === ":") index++;
	return index === value.length;
}
function isMarkdownTableDelimiterLine(trimmed) {
	if (!trimmed.includes("|")) return false;
	const withoutLeadingPipe = trimmed[0] === "|" ? trimmed.slice(1) : trimmed;
	return (withoutLeadingPipe.endsWith("|") ? withoutLeadingPipe.slice(0, -1) : withoutLeadingPipe).split("|").every(isMarkdownTableDelimiterCell);
}
function isOrderedListBoundaryLine(trimmed) {
	let index = 0;
	if (!isAsciiDigit(trimmed[index])) return false;
	while (isAsciiDigit(trimmed[index])) index++;
	if (trimmed[index] !== "." && trimmed[index] !== ")") return false;
	return isSpaceOrTab(trimmed[index + 1]);
}
function isTolerantBoundaryStopLine(line) {
	const trimmed = line.trimStart();
	if (!trimmed) return true;
	if (trimmed.startsWith("```") || trimmed.startsWith("~~~") || trimmed.startsWith(":::")) return true;
	if (trimmed[0] === ">" || trimmed[0] === "<") return true;
	if (trimmed[0] === "#") {
		let level = 0;
		while (trimmed[level] === "#") level++;
		if (level >= 1 && level <= 6 && isSpaceOrTab(trimmed[level])) return true;
	}
	if ((trimmed[0] === "-" || trimmed[0] === "+" || trimmed[0] === "*") && isSpaceOrTab(trimmed[1])) return true;
	if (isOrderedListBoundaryLine(trimmed)) return true;
	if (isThematicLikeLine(trimmed)) return true;
	if (isMarkdownTableDelimiterLine(trimmed)) return true;
	return false;
}
function appendTolerantBoundaryContent(content, line) {
	if (!content) return line;
	if (!line) return content;
	return `${content}\n${line}`;
}
function isTolerantMathBlockContent(content) {
	const stripped = String(content ?? "").trim();
	if (!stripped) return false;
	return isMathLike(stripped);
}
function hashTolerantBoundaryContent(content) {
	let hash = 0;
	for (let index = 0; index < content.length; index++) hash = hash * 31 + content.charCodeAt(index) | 0;
	return hash.toString(36);
}
function getTolerantBoundaryScanWindow(source) {
	if (source.length <= TOLERANT_BOUNDARY_SCAN_TAIL_CHARS) return {
		source,
		lineOffset: 0
	};
	let start = source.length - TOLERANT_BOUNDARY_SCAN_TAIL_CHARS;
	const nextLineBreak = source.indexOf("\n", start);
	if (nextLineBreak === -1) return {
		source: "",
		lineOffset: countLineBreaks(source)
	};
	start = nextLineBreak + 1;
	return {
		source: source.slice(start),
		lineOffset: countLineBreaks(source.slice(0, start))
	};
}
function mayContainTolerantMathBlockBoundaryOpener(markdown) {
	const fullSource = String(markdown ?? "");
	if (!fullSource || !fullSource.includes("$$") && !fullSource.includes("\\[")) return false;
	const { source } = getTolerantBoundaryScanWindow(fullSource);
	if (!source) return false;
	const lines = source.split(/\r?\n/);
	const startLine = Math.max(0, lines.length - TOLERANT_BOUNDARY_SCAN_MAX_LINES - 2);
	const delimiters = [["$$", "$$"], ["\\[", "\\]"]];
	for (let line = startLine; line < lines.length; line++) {
		const openingLine = trimRightSpaceOrTab(lines[line]);
		if (!openingLine) continue;
		if (isTolerantBoundaryStopLine(openingLine)) continue;
		for (const [openDelim, closeDelim] of delimiters) if (getTolerantBoundaryLineEndOpenIndex(openingLine, openDelim, closeDelim) !== -1) return true;
	}
	return false;
}
function getTolerantMathBlockBoundaryStreamKey(markdown) {
	const fullSource = String(markdown ?? "");
	if (!fullSource || !fullSource.includes("$$") && !fullSource.includes("\\[")) return null;
	const { source, lineOffset } = getTolerantBoundaryScanWindow(fullSource);
	if (!source) return null;
	const lines = source.split(/\r?\n/);
	const startLine = Math.max(0, lines.length - TOLERANT_BOUNDARY_SCAN_MAX_LINES - 2);
	const delimiters = [["$$", "$$"], ["\\[", "\\]"]];
	for (let line = startLine; line < lines.length - 1; line++) {
		const openingLine = trimRightSpaceOrTab(lines[line]);
		for (const [openDelim, closeDelim] of delimiters) {
			const openIndex = getTolerantBoundaryLineEndOpenIndex(openingLine, openDelim, closeDelim);
			if (openIndex === -1) continue;
			let content = "";
			let stopped = false;
			for (let currentLine = line + 1; currentLine < lines.length; currentLine++) {
				if (currentLine - line > TOLERANT_BOUNDARY_SCAN_MAX_LINES) {
					stopped = true;
					break;
				}
				const current = lines[currentLine];
				const closeIndex = findUnescapedDelimiter(current, closeDelim);
				if (closeIndex !== -1) {
					const nextContent = appendTolerantBoundaryContent(content, current.slice(0, closeIndex));
					if (!isTolerantMathBlockContent(nextContent)) {
						stopped = true;
						break;
					}
					const suffix = current.slice(closeIndex + closeDelim.length);
					const suffixKey = suffix.trim() ? `suffix:${hashTolerantBoundaryContent(suffix)}` : "nosuffix";
					return [
						"closed",
						openDelim,
						lineOffset + line,
						openIndex,
						lineOffset + currentLine,
						closeIndex,
						hashTolerantBoundaryContent(nextContent),
						suffixKey
					].join(":");
				}
				if (isTolerantBoundaryStopLine(current)) {
					stopped = true;
					break;
				}
				content = appendTolerantBoundaryContent(content, current);
				if (content.length > TOLERANT_BOUNDARY_SCAN_MAX_CHARS) {
					stopped = true;
					break;
				}
			}
			if (!stopped && isTolerantMathBlockContent(content)) return [
				"pending",
				openDelim,
				lineOffset + line,
				openIndex
			].join(":");
		}
	}
	return null;
}
function isLikelyCurrencyRangeDollar(content, nextChar) {
	const stripped = String(content ?? "").trim();
	if (!stripped) return false;
	if (!/^\d[\d,.]*\s*[~～-]\s*$/.test(stripped)) return false;
	return /\d/.test(String(nextChar ?? ""));
}
function isLikelyCurrencyAmountStart(content) {
	const stripped = String(content ?? "").trimStart();
	const amount = stripped.match(/^\d+(?:,\d{3})*(?:\.\d+)?/);
	if (!amount) return false;
	const rest = stripped.slice(amount[0].length);
	if (/^\s*(?:[+\-*/^_=<>]|\\[a-z]+)/i.test(rest)) return false;
	return rest === "" || /^[)\s,.!?;:]/.test(rest);
}
function isLikelyPlaceholderDollar(content) {
	const stripped = String(content ?? "").trim();
	if (!stripped) return false;
	return /^(?:\.{3,}|…+)$/.test(stripped);
}
function applyMath(md, mathOpts) {
	markMarkstreamMathPluginApplied(md);
	const pushInlineParagraph = (s, content, line) => {
		const paragraphContent = String(content ?? "").replace(/^[\t ]+/, "").replace(/[\t ]+$/, "");
		if (!paragraphContent) return;
		const paragraphOpen = s.push("paragraph_open", "p", 1);
		paragraphOpen.map = [line, line + 1];
		const inlineToken = s.push("inline", "", 0);
		inlineToken.content = paragraphContent;
		inlineToken.map = [line, line + 1];
		inlineToken.children = [];
		s.push("paragraph_close", "p", -1);
	};
	const mathInline = (state, silent) => {
		const s = state;
		const strict = !!mathOpts?.strictDelimiters;
		const allowLoading = !s?.env?.__markstreamFinal;
		const preserveSpacesBeforeLineBreak = (src, start) => {
			let end = start;
			while (end < src.length && (src[end] === " " || src[end] === "	")) end++;
			if (end === start) return start;
			if (!(src[end] === "\n" || src[end] === "\r" && src[end + 1] === "\n")) return start;
			const text$1 = src.slice(start, end);
			const token = s.push("text", "", 0);
			token.content = text$1;
			return end;
		};
		if (/^\*[^*]+/.test(s.src)) return false;
		if (s.src[s.pos] === "$") {
			let dollarRunEnd = s.pos + 1;
			while (s.src[dollarRunEnd] === "$") dollarRunEnd++;
			const dollarRunLength = dollarRunEnd - s.pos;
			const nextChar = s.src[dollarRunEnd];
			if (dollarRunLength >= 3 && (!nextChar || /\s/.test(nextChar))) {
				const token = s.push("text", "", 0);
				token.content = s.src.slice(s.pos, dollarRunEnd);
				s.pos = dollarRunEnd;
				return true;
			}
		}
		const delimiters = [
			["$$", "$$"],
			["$", "$"],
			["\\(", "\\)"]
		];
		const pending = String(s.pending ?? "");
		const currentStart = Math.max(0, s.pos - pending.length);
		let searchPos = currentStart;
		let preMathPos = currentStart;
		const initialPos = currentStart;
		for (const [open, close] of delimiters) {
			const src = s.src;
			const codeSpanRanges = buildCodeSpanRanges(src);
			const imageRanges = buildImageRanges(src, allowLoading);
			let foundAny = false;
			if (open === "$$" && searchPos !== initialPos) searchPos = initialPos;
			let lastIndex = -1;
			let lastSearchPos = -1;
			let stallCount = 0;
			const pushText = (text$1) => {
				if (text$1 === "undefined" || text$1 == null) text$1 = "";
				if (text$1 === "\\") {
					s.pos = s.pos + text$1.length;
					searchPos = s.pos;
					return;
				}
				if (text$1 === "\\)" || text$1 === "\\(") {
					const t$1 = s.push("text_special", "", 0);
					t$1.content = text$1 === "\\)" ? ")" : "(";
					t$1.markup = text$1;
					s.pos = s.pos + text$1.length;
					searchPos = s.pos;
					return;
				}
				if (!text$1) return;
				if (open === "$$" && text$1.includes("$")) {
					let localPos = 0;
					while (localPos < text$1.length) {
						const dollarIndex = findNextUnescapedDollar(text$1, localPos);
						if (dollarIndex === -1) {
							const rest = text$1.slice(localPos);
							if (rest) {
								const t$2 = s.push("text", "", 0);
								t$2.content = rest;
								s.pos = s.pos + rest.length;
								searchPos = s.pos;
							}
							break;
						}
						if (dollarIndex > 0 && text$1[dollarIndex - 1] === "$" || dollarIndex + 1 < text$1.length && text$1[dollarIndex + 1] === "$") {
							const beforeSkip = text$1.slice(localPos, dollarIndex + 1);
							if (beforeSkip) {
								const t$2 = s.push("text", "", 0);
								t$2.content = beforeSkip;
								s.pos = s.pos + beforeSkip.length;
								searchPos = s.pos;
							}
							localPos = dollarIndex + 1;
							continue;
						}
						const before = text$1.slice(localPos, dollarIndex);
						if (before) {
							const t$2 = s.push("text", "", 0);
							t$2.content = before;
							s.pos = s.pos + before.length;
							searchPos = s.pos;
						}
						const closingDollarIndex = findSingleDollarClose(text$1, dollarIndex + 1);
						if (closingDollarIndex === -1) {
							const rest = text$1.slice(dollarIndex);
							const t$2 = s.push("text", "", 0);
							t$2.content = rest;
							s.pos = s.pos + rest.length;
							searchPos = s.pos;
							break;
						}
						const content = text$1.slice(dollarIndex + 1, closingDollarIndex);
						const hasBacktick = content.includes("`");
						const isEmpty = !content || !content.trim();
						const nextChar = text$1[closingDollarIndex + 1];
						const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar);
						const isPlaceholder = isLikelyPlaceholderDollar(content);
						if (!hasBacktick && !isEmpty && !isCurrencyRange && !isPlaceholder) {
							const token = s.push("math_inline", "math", 0);
							token.content = normalizeStandaloneBackslashT(content, mathOpts);
							token.markup = "$";
							token.raw = `$${content}$`;
							token.loading = false;
							s.pos = s.pos + (closingDollarIndex - dollarIndex + 1);
							searchPos = s.pos;
							localPos = closingDollarIndex + 1;
							continue;
						}
						const t$1 = s.push("text", "", 0);
						t$1.content = "$";
						s.pos = s.pos + 1;
						searchPos = s.pos;
						localPos = dollarIndex + 1;
					}
					return;
				}
				const imageStart = text$1.indexOf("![");
				if (imageStart !== -1) {
					if (imageStart > 0) {
						const beforeImage = text$1.slice(0, imageStart);
						const t$2 = s.push("text", "", 0);
						t$2.content = beforeImage;
						s.pos = s.pos + beforeImage.length;
						searchPos = s.pos;
					}
					const imageMatch = text$1.slice(imageStart).match(/^!\[([^\]]*)\]\(([^)]+)\)/);
					if (imageMatch) {
						const [, alt, srcAndTitle] = imageMatch;
						const srcMatch = srcAndTitle.match(/^(\S+)(?:\s+"([^"]+)")?\s*$/);
						const src$1 = srcMatch ? srcMatch[1] : srcAndTitle;
						const title = srcMatch && srcMatch[2] ? srcMatch[2] : null;
						const token = s.push("image", "img", 0);
						token.attrs = [["src", src$1], ["alt", alt]];
						if (title) token.attrs.push(["title", title]);
						token.content = alt;
						token.children = [{
							type: "text",
							content: alt,
							tag: ""
						}];
						s.pos = s.pos + imageMatch[0].length;
						searchPos = s.pos;
						const remainingText = text$1.slice(imageStart + imageMatch[0].length);
						if (remainingText) pushText(remainingText);
						return;
					}
					const t$1 = s.push("text", "", 0);
					t$1.content = text$1;
					s.pos = s.pos + text$1.length;
					searchPos = s.pos;
					return;
				}
				const t = s.push("text", "", 0);
				t.content = text$1;
				s.pos = s.pos + text$1.length;
				searchPos = s.pos;
			};
			while (true) {
				if (searchPos >= src.length) break;
				const index = src.indexOf(open, searchPos);
				if (index === -1) break;
				if (isEscapedAt(src, index)) {
					searchPos = index + Math.max(1, open.length);
					continue;
				}
				const codeSpanAtIndex = findRangeAt(codeSpanRanges, index);
				if (codeSpanAtIndex) {
					searchPos = codeSpanAtIndex[1];
					continue;
				}
				const imageRangeAtIndex = findRangeAt(imageRanges, index);
				if (imageRangeAtIndex) {
					searchPos = imageRangeAtIndex[1];
					continue;
				}
				if (index === lastIndex && searchPos === lastSearchPos) {
					stallCount++;
					if (stallCount > 2) {
						searchPos = index + Math.max(1, open.length);
						continue;
					}
				} else {
					stallCount = 0;
					lastIndex = index;
					lastSearchPos = searchPos;
				}
				if (open === "(" && index > 0) {
					let i = index - 1;
					while (i >= 0 && src[i] === " ") i--;
					if (i >= 0 && src[i] === "]") {
						searchPos = index + open.length;
						continue;
					}
				}
				if (open === "$" && index > 0 && src[index - 1] === "$") {
					searchPos = index + 1;
					continue;
				}
				if (open === "$" && index < src.length - 1 && src[index + 1] === "$") {
					searchPos = index + 2;
					continue;
				}
				const endIdx = open === "$" ? findSingleDollarClose(src, index + open.length) : findMatchingClose_default(src, index + open.length, open, close);
				if (endIdx === -1) {
					const content$1 = src.slice(index + open.length);
					if (content$1.includes(open)) {
						searchPos = src.indexOf(open, index + open.length);
						continue;
					}
					if (endIdx === -1) {
						const isCurrencyAmount = open === "$" && isLikelyCurrencyAmountStart(content$1);
						if (allowLoading && !strict && !isCurrencyAmount && isMathLike(content$1) && !content$1.includes("`")) {
							searchPos = index + open.length;
							foundAny = true;
							if (!silent) {
								s.pending = "";
								const toPushBefore = preMathPos ? src.slice(preMathPos, searchPos) : src.slice(0, searchPos);
								const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1;
								if (preMathPos) pushText(src.slice(preMathPos, searchPos));
								else {
									let text$1 = src.slice(0, searchPos);
									if (text$1.endsWith(open)) text$1 = text$1.slice(0, text$1.length - open.length);
									pushText(text$1);
								}
								if (isStrongPrefix) {
									const strongMarker = findLastUnescapedStrongMarker(toPushBefore)?.marker ?? "**";
									const strongToken = s.push("strong_open", "", 0);
									strongToken.markup = strongMarker;
									const token = s.push("math_inline", "math", 0);
									token.content = normalizeStandaloneBackslashT(content$1, mathOpts);
									token.markup = open === "$$" ? "$$" : open === "\\(" ? "\\(\\)" : open === "$" ? "$" : "()";
									token.raw = `${open}${content$1}${close}`;
									token.loading = true;
									strongToken.content = content$1;
									s.push("strong_close", "", 0);
								} else {
									const token = s.push("math_inline", "math", 0);
									token.content = normalizeStandaloneBackslashT(content$1, mathOpts);
									token.markup = open === "$$" ? "$$" : open === "\\(" ? "\\(\\)" : open === "$" ? "$" : "()";
									token.raw = `${open}${content$1}${close}`;
									token.loading = true;
								}
								s.pos = src.length;
							}
							searchPos = src.length;
							preMathPos = searchPos;
						}
						break;
					}
				}
				const content = src.slice(index + open.length, endIdx);
				const hasBacktick = content.includes("`");
				const isEmpty = !content || !content.trim();
				const isDollar = open === "$";
				const nextChar = src[endIdx + close.length];
				const isCurrencyRange = isDollar && isLikelyCurrencyRangeDollar(content, nextChar);
				const isPlaceholder = isDollar && isLikelyPlaceholderDollar(content);
				if (strict ? hasBacktick || isEmpty || isCurrencyRange || isPlaceholder : hasBacktick || isEmpty || isCurrencyRange || isPlaceholder || !isDollar && !isMathLike(content)) {
					searchPos = endIdx + close.length;
					const text$1 = src.slice(s.pos, searchPos);
					if (!s.pending) {
						pushText(text$1);
						preMathPos = searchPos;
					}
					continue;
				}
				foundAny = true;
				if (!silent) {
					const before = src.slice(s.pos - (s.pending ?? "").length, index);
					let toPushBefore = src.slice(0, searchPos) ? src.slice(preMathPos, index) : before;
					const isStrongPrefix = countUnescapedStrong(toPushBefore) % 2 === 1;
					if (index !== s.pos && isStrongPrefix) toPushBefore = s.pending + src.slice(s.pos, index);
					const strongMarkerInfo = isStrongPrefix ? findLastUnescapedStrongMarker(toPushBefore) : null;
					const strongMarker = strongMarkerInfo?.marker ?? "**";
					if (s.pending !== toPushBefore) {
						s.pending = "";
						if (isStrongPrefix) if (strongMarkerInfo) {
							const after = toPushBefore.slice(strongMarkerInfo.index + strongMarker.length);
							pushText(toPushBefore.slice(0, strongMarkerInfo.index));
							const strongToken = s.push("strong_open", "", 0);
							strongToken.markup = strongMarker;
							const textToken$1 = s.push("text", "", 0);
							textToken$1.content = after;
							s.push("strong_close", "", 0);
						} else pushText(toPushBefore);
						else pushText(toPushBefore);
					}
					if (isStrongPrefix) {
						const strongToken = s.push("strong_open", "", 0);
						strongToken.markup = strongMarker;
						const token = s.push("math_inline", "math", 0);
						token.content = normalizeStandaloneBackslashT(content, mathOpts);
						token.markup = open === "$$" ? "$$" : open === "\\(" ? "\\(\\)" : open === "$" ? "$" : "()";
						token.raw = `${open}${content}${close}`;
						token.loading = false;
						const isBeforeClose = src.slice(endIdx + close.length).startsWith(strongMarker);
						if (isBeforeClose) s.push("strong_close", "", 0);
						s.pos = preserveSpacesBeforeLineBreak(src, endIdx + close.length);
						searchPos = s.pos;
						preMathPos = searchPos;
						if (!isBeforeClose) s.push("strong_close", "", 0);
						return true;
					} else {
						const token = s.push("math_inline", "math", 0);
						token.content = normalizeStandaloneBackslashT(content, mathOpts);
						token.markup = open === "$$" ? "$$" : open === "\\(" ? "\\(\\)" : open === "$" ? "$" : "()";
						token.raw = `${open}${content}${close}`;
						token.loading = false;
					}
				}
				searchPos = preserveSpacesBeforeLineBreak(src, endIdx + close.length);
				preMathPos = searchPos;
				s.pos = searchPos;
				return true;
			}
			if (foundAny) {
				if (!silent) {
					if (open === "$$" && searchPos < src.length && src.slice(searchPos).includes("$")) {
						let remainingPos = searchPos;
						while (true) {
							if (remainingPos >= src.length) break;
							const dollarIndex = findNextUnescapedDollar(src, remainingPos);
							if (dollarIndex === -1) break;
							if (dollarIndex + 1 < src.length && src[dollarIndex + 1] === "$") {
								remainingPos = dollarIndex + 2;
								continue;
							}
							if (dollarIndex > 0 && src[dollarIndex - 1] === "$") {
								remainingPos = dollarIndex + 1;
								continue;
							}
							const closingDollarIndex = findSingleDollarClose(src, dollarIndex + 1);
							if (closingDollarIndex === -1) break;
							const content = src.slice(dollarIndex + 1, closingDollarIndex);
							const hasBacktick = content.includes("`");
							const isEmpty = !content || !content.trim();
							const nextChar = src[closingDollarIndex + 1];
							const isCurrencyRange = isLikelyCurrencyRangeDollar(content, nextChar);
							const isPlaceholder = isLikelyPlaceholderDollar(content);
							if (!hasBacktick && !isEmpty && !isCurrencyRange && !isPlaceholder) {
								const before = src.slice(searchPos, dollarIndex);
								if (before) pushText(before);
								const token = s.push("math_inline", "math", 0);
								token.content = normalizeStandaloneBackslashT(content, mathOpts);
								token.markup = "$";
								token.raw = `$${content}$`;
								token.loading = false;
								searchPos = closingDollarIndex + 1;
								remainingPos = closingDollarIndex + 1;
							} else {
								pushText("$");
								remainingPos = dollarIndex + 1;
							}
						}
						if (remainingPos < src.length) pushText(src.slice(remainingPos));
					} else if (searchPos < src.length) pushText(src.slice(searchPos));
					s.pos = src.length;
				} else s.pos = searchPos;
				return true;
			}
		}
		return false;
	};
	const mathBlock = (state, startLine, endLine, silent) => {
		const s = state;
		const allowLoading = !s?.env?.__markstreamFinal;
		const strict = mathOpts?.strictDelimiters;
		const delimiters = strict ? [["\\[", "\\]"], ["$$", "$$"]] : [
			["\\[", "\\]"],
			["[", "]"],
			["$$", "$$"]
		];
		const startPos = s.bMarks[startLine] + s.tShift[startLine];
		let lineText = s.src.slice(startPos, s.eMarks[startLine]).trim();
		let matched = false;
		let openDelim = "";
		let closeDelim = "";
		let skipFirstLine = false;
		let prefixBeforeOpen = "";
		let tolerantBoundary = false;
		for (const [open, close] of delimiters) if (lineText.startsWith(open)) if (open.includes("[")) if (mathOpts?.strictDelimiters) {
			if (lineText.replace("\\", "") === "[") {
				if (startLine + 1 < endLine) {
					matched = true;
					openDelim = open;
					closeDelim = close;
					break;
				}
				continue;
			}
		} else if (lineText.replace("\\", "") === "[") {
			if (startLine + 1 < endLine) {
				matched = true;
				openDelim = open;
				closeDelim = close;
				break;
			}
			continue;
		} else {
			const lastToken = s.tokens[s.tokens.length - 1];
			if (lastToken && lastToken.type === "list_item_open" && lastToken.mark === "-" && lineText.slice(open.length, lineText.indexOf("]")).trim() === "x") continue;
			if (lineText.replace("\\", "").startsWith("[") && !lineText.includes("](")) {
				const closeIndex = lineText.indexOf("]");
				if (lineText.slice(closeIndex).trim() !== "]") continue;
				const inner = lineText.slice(open.length, closeIndex);
				if (open === "[" ? isPlainBracketMathLike(inner) : isMathLike(inner)) {
					matched = true;
					openDelim = open;
					closeDelim = close;
					break;
				}
				continue;
			}
		}
		else {
			matched = true;
			openDelim = open;
			closeDelim = close;
			break;
		}
		else if ((open === "$$" || open === "\\[") && lineText.endsWith(open) && startLine + 1 < endLine) {
			const openIndex = getTolerantBoundaryLineEndOpenIndex(lineText, open, close);
			if (openIndex === -1) continue;
			prefixBeforeOpen = trimRightSpaceOrTab(lineText.slice(0, openIndex));
			tolerantBoundary = true;
			const nextLineStartPos = s.bMarks[startLine + 1] + s.tShift[startLine + 1];
			lineText = s.src.slice(nextLineStartPos, s.eMarks[startLine + 1]).trim();
			skipFirstLine = true;
			matched = true;
			openDelim = open;
			closeDelim = close;
			break;
		}
		if (!matched) return false;
		if (silent && !tolerantBoundary) return true;
		const startDelimIndex = lineText.indexOf(openDelim);
		const closeSearchStart = startDelimIndex + openDelim.length;
		const escapedPlainBracketCloseIndex = !strict && openDelim === "[" ? lineText.indexOf("\\]", closeSearchStart) : -1;
		const sameLineCloseDelim = escapedPlainBracketCloseIndex >= 0 ? "\\]" : closeDelim;
		const sameLineCloseIndex = escapedPlainBracketCloseIndex >= 0 ? escapedPlainBracketCloseIndex : findUnescapedDelimiter(lineText, closeDelim, closeSearchStart);
		if (!skipFirstLine && sameLineCloseIndex > openDelim.length) {
			const content$1 = lineText.slice(startDelimIndex + openDelim.length, sameLineCloseIndex);
			const token$1 = s.push("math_block", "math", 0);
			token$1.content = normalizeStandaloneBackslashT(content$1);
			token$1.markup = openDelim === "$$" ? "$$" : openDelim === "[" ? "[]" : "\\[\\]";
			token$1.map = [startLine, startLine + 1];
			token$1.raw = `${openDelim}${content$1}${sameLineCloseDelim}`;
			token$1.block = true;
			token$1.loading = false;
			s.line = startLine + 1;
			const trailingAfterClose$1 = lineText.slice(sameLineCloseIndex + sameLineCloseDelim.length);
			if (trailingAfterClose$1.trim()) pushInlineParagraph(s, trailingAfterClose$1, startLine);
			return true;
		}
		let nextLine = startLine;
		let content = "";
		let found = false;
		let trailingAfterClose = "";
		let trailingAfterCloseLine = startLine;
		const firstLineContent = skipFirstLine ? lineText : lineText === openDelim ? "" : lineText.slice(openDelim.length);
		const fallbackPlainBracketClose = !strict && openDelim === "\\[" ? "]" : "";
		const firstLineCloseIndex = findUnescapedDelimiter(firstLineContent, closeDelim);
		if (firstLineCloseIndex !== -1) {
			const endIndex = firstLineCloseIndex;
			content = firstLineContent.slice(0, endIndex);
			trailingAfterClose = firstLineContent.slice(endIndex + closeDelim.length);
			trailingAfterCloseLine = skipFirstLine ? startLine + 1 : startLine;
			found = true;
			nextLine = trailingAfterCloseLine;
		} else {
			if (firstLineContent && !skipFirstLine) content = firstLineContent;
			for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
				const lineStart = s.bMarks[nextLine] + s.tShift[nextLine];
				const lineEnd = s.eMarks[nextLine];
				const currentLine = s.src.slice(lineStart, lineEnd);
				const currentLineTrimmed = currentLine.trim();
				if (!strict && openDelim === "[" && currentLineTrimmed === "\\]") {
					closeDelim = "\\]";
					found = true;
					break;
				}
				if (fallbackPlainBracketClose && currentLine.trim() === fallbackPlainBracketClose) {
					closeDelim = fallbackPlainBracketClose;
					found = true;
					break;
				}
				if (currentLineTrimmed === closeDelim) {
					found = true;
					break;
				} else if (!strict && openDelim === "[" && currentLine.includes("\\]")) {
					found = true;
					const endIndex = currentLine.indexOf("\\]");
					closeDelim = "\\]";
					const beforeClose = currentLine.slice(0, endIndex);
					if (beforeClose) content += (content ? "\n" : "") + beforeClose;
					trailingAfterClose = currentLine.slice(endIndex + closeDelim.length);
					trailingAfterCloseLine = nextLine;
					break;
				} else if (findUnescapedDelimiter(currentLine, closeDelim) !== -1) {
					found = true;
					const endIndex = findUnescapedDelimiter(currentLine, closeDelim);
					const beforeClose = currentLine.slice(0, endIndex);
					if (beforeClose) content += (content ? "\n" : "") + beforeClose;
					trailingAfterClose = currentLine.slice(endIndex + closeDelim.length);
					trailingAfterCloseLine = nextLine;
					break;
				}
				content += (content ? "\n" : "") + currentLine;
			}
		}
		if ((!allowLoading || strict) && !found) return false;
		const hasMarkdownPrefix = /^\s*!\[/.test(content);
		if (!(tolerantBoundary ? !hasMarkdownPrefix && isTolerantMathBlockContent(content) : openDelim === "$$" ? !hasMarkdownPrefix : openDelim === "[" ? isPlainBracketMathLike(content) : isMathLike(content))) return false;
		if (silent) return true;
		if (prefixBeforeOpen) pushInlineParagraph(s, prefixBeforeOpen, startLine);
		const token = s.push("math_block", "math", 0);
		token.content = normalizeStandaloneBackslashT(content);
		token.markup = openDelim === "$$" ? "$$" : openDelim === "[" ? "[]" : "\\[\\]";
		token.raw = `${openDelim}${content}${content.startsWith("\n") ? "\n" : ""}${closeDelim}`;
		token.map = [startLine, nextLine + 1];
		token.block = true;
		token.loading = !found;
		s.line = nextLine + 1;
		if (trailingAfterClose.trim()) pushInlineParagraph(s, trailingAfterClose, trailingAfterCloseLine);
		return true;
	};
	const explicitMathBlockBeforeSetext = (state, startLine, endLine, silent) => {
		const s = state;
		const startPos = s.bMarks[startLine] + s.tShift[startLine];
		const lineText = s.src.slice(startPos, s.eMarks[startLine]).trim();
		if (!lineText.startsWith("$$") && !lineText.startsWith("\\[")) return false;
		return mathBlock(state, startLine, endLine, silent);
	};
	md.inline.ruler.before("escape", "math", mathInline);
	md.block.ruler.before("lheading", "explicit_math_block", explicitMathBlockBeforeSetext, { alt: [
		"paragraph",
		"reference",
		"blockquote",
		"list"
	] });
	md.block.ruler.before("paragraph", "math_block", mathBlock, { alt: [
		"paragraph",
		"reference",
		"blockquote",
		"list"
	] });
}

//#endregion
//#region src/renderers/index.ts
function applyRenderRules(md) {
	const defaultImage = md.renderer.rules.image || function(tokens, idx, options, env, self) {
		const tokensAny = tokens;
		const selfShape = self;
		return selfShape.renderToken ? selfShape.renderToken(tokensAny, idx, options) : "";
	};
	md.renderer.rules.image = (tokens, idx, options, env, self) => {
		const tokensAny = tokens;
		tokensAny[idx].attrSet?.("loading", "lazy");
		return defaultImage(tokensAny, idx, options, env, self);
	};
	md.renderer.rules.fence = md.renderer.rules.fence || ((tokens, idx) => {
		const tokenShape = tokens[idx];
		const info = String(tokenShape.info ?? "").trim();
		return `<pre class="${info ? `language-${md.utils.escapeHtml(info.split(/\s+/g)[0])}` : ""}"><code>${md.utils.escapeHtml(String(tokenShape.content ?? ""))}</code></pre>`;
	});
}

//#endregion
//#region src/factory.ts
function factory(opts = {}) {
	const markdownItOptions = opts.markdownItOptions ?? {};
	const experimental = typeof markdownItOptions.experimental === "object" && markdownItOptions.experimental !== null ? markdownItOptions.experimental : {};
	const stream = Object.prototype.hasOwnProperty.call(markdownItOptions, "stream") ? Boolean(markdownItOptions.stream) : true;
	const md = new src_default({
		html: true,
		linkify: true,
		typographer: true,
		...markdownItOptions,
		experimental: {
			stream,
			...experimental
		}
	});
	if (opts.enableMath ?? true) applyMath(md, {
		...getDefaultMathOptions() ?? {},
		...opts.mathOptions ?? {}
	});
	if (opts.enableContainers ?? true) applyContainers(md);
	if (opts.enableFixIndentedCodeBlock !== false) applyFixIndentedCodeBlock(md);
	applyFixLinkTokens(md);
	applyFixStrongTokens(md);
	applyFixListItem(md);
	applyFixTableTokens(md);
	applyRenderRules(md);
	applyFixHtmlInlineTokens(md, { customHtmlTags: opts.customHtmlTags });
	return md;
}

//#endregion
//#region src/parser/token-copy.ts
function cloneTokenWithMutableChildren(token) {
	const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token);
	if (Array.isArray(token.attrs)) copy.attrs = token.attrs.map((attr) => [...attr]);
	if (Array.isArray(token.map)) copy.map = [...token.map];
	if (Array.isArray(token.children)) copy.children = token.children.map((child) => cloneTokenWithMutableChildren(child));
	return copy;
}

//#endregion
//#region src/parser/inline-parsers/checkbox-parser.ts
function parseCheckboxToken(token) {
	const tokenMeta = token.meta ?? {};
	return {
		type: "checkbox",
		checked: tokenMeta.checked === true,
		raw: tokenMeta.checked ? "[x]" : "[ ]"
	};
}
function parseCheckboxInputToken(token) {
	const tokenAny = token;
	const rawAttr = tokenAny.attrGet ? tokenAny.attrGet("checked") : void 0;
	const checked = rawAttr === "" || rawAttr === "true";
	return {
		type: "checkbox_input",
		checked,
		raw: checked ? "[x]" : "[ ]"
	};
}

//#endregion
//#region src/parser/inline-parsers/emoji-parser.ts
function parseEmojiToken(token) {
	const name = String(token.content ?? "");
	return {
		type: "emoji",
		name,
		markup: String(token.markup ?? ""),
		raw: `:${name}:`
	};
}

//#endregion
//#region src/parser/inline-parsers/emphasis-parser.ts
function parseEmphasisToken(tokens, startIndex, options) {
	const children = [];
	let emText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "em_close") {
		const tokenText = tokens[i];
		emText += String(tokens[i].content ?? tokenText.text ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	return {
		node: {
			type: "emphasis",
			children,
			raw: `*${emText}*`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/fence-parser.ts
const TRAILING_FENCE_LINE_RE = /\r?\n[ \t]*`+\s*$/;
const DIFF_HEADER_PREFIXES = [
	"diff ",
	"index ",
	"--- ",
	"+++ ",
	"@@ "
];
const NEWLINE_RE = /\r?\n/;
function isPotentialDiffMetadataTail(line) {
	const value = String(line ?? "");
	if (!value) return false;
	return DIFF_HEADER_PREFIXES.some((prefix) => prefix.startsWith(value) || value.startsWith(prefix));
}
function flushPendingDiffHunk(orig, updated, pendingOrig, pendingUpdated) {
	if (pendingOrig.length > 0) orig.push(...pendingOrig);
	if (pendingUpdated.length > 0) updated.push(...pendingUpdated);
	pendingOrig.length = 0;
	pendingUpdated.length = 0;
}
function splitUnifiedDiff(content, closed) {
	const orig = [];
	const updated = [];
	const pendingOrig = [];
	const pendingUpdated = [];
	const lines = content.split(NEWLINE_RE);
	const endsWithNewline = /\r?\n$/.test(content);
	const hasUnifiedDiffHeaders = lines.some((line) => line.startsWith("diff ") || line.startsWith("--- ") || line.startsWith("+++ ") || line.startsWith("@@ "));
	const processLine = (rawLine) => {
		const line = rawLine;
		if (DIFF_HEADER_PREFIXES.some((p) => line.startsWith(p))) return;
		if (line.startsWith("-")) {
			const body = line.slice(1);
			pendingOrig.push(!hasUnifiedDiffHeaders && body.startsWith(" ") ? ` ${body}` : body);
		} else if (line.startsWith("+")) {
			const body = line.slice(1);
			pendingUpdated.push(!hasUnifiedDiffHeaders && body.startsWith(" ") ? ` ${body}` : body);
		} else {
			flushPendingDiffHunk(orig, updated, pendingOrig, pendingUpdated);
			const contextLine = hasUnifiedDiffHeaders && line.startsWith(" ") ? line.slice(1) : line;
			orig.push(contextLine);
			updated.push(contextLine);
		}
	};
	const lineCountToProcess = endsWithNewline ? Math.max(0, lines.length - 1) : lines.length;
	for (let index = 0; index < lineCountToProcess; index++) {
		const line = lines[index] ?? "";
		if (!closed && !endsWithNewline && index === lineCountToProcess - 1 && isPotentialDiffMetadataTail(line)) continue;
		processLine(line);
	}
	if (closed || pendingOrig.length > 0 || pendingUpdated.length > 0) flushPendingDiffHunk(orig, updated, pendingOrig, pendingUpdated);
	const originalCode = orig.join("\n");
	const updatedCode = updated.join("\n");
	return {
		original: closed && endsWithNewline && originalCode ? `${originalCode}\n` : originalCode,
		updated: closed && endsWithNewline && updatedCode ? `${updatedCode}\n` : updatedCode
	};
}
function parseFenceToken(token) {
	const hasMap = Array.isArray(token.map) && token.map.length === 2;
	const tokenMeta = token.meta ?? {};
	const metaClosed = typeof tokenMeta.closed === "boolean" ? tokenMeta.closed : void 0;
	const closed = metaClosed === true || metaClosed !== false && hasMap;
	const info = String(token.info ?? "");
	const diff = info.startsWith("diff");
	const language = diff ? (() => {
		const s = info;
		const sp = s.indexOf(" ");
		return sp === -1 ? "" : String(s.slice(sp + 1) ?? "");
	})() : info;
	let content = String(token.content ?? "");
	if (TRAILING_FENCE_LINE_RE.test(content)) content = content.replace(TRAILING_FENCE_LINE_RE, "");
	if (diff) {
		const { original, updated } = splitUnifiedDiff(content, closed === true);
		return {
			type: "code_block",
			language,
			code: String(updated ?? ""),
			raw: String(content ?? ""),
			diff,
			loading: metaClosed === true ? false : metaClosed === false ? true : !hasMap,
			originalCode: original,
			updatedCode: updated
		};
	}
	return {
		type: "code_block",
		language,
		code: String(content ?? ""),
		raw: String(content ?? ""),
		diff,
		loading: metaClosed === true ? false : metaClosed === false ? true : !hasMap
	};
}

//#endregion
//#region src/parser/inline-parsers/footnote-ref-parser.ts
function parseFootnoteRefToken(token) {
	const tokenMeta = token.meta ?? {};
	return {
		type: "footnote_reference",
		id: String(tokenMeta.label ?? ""),
		raw: `[^${String(tokenMeta.label ?? "")}]`
	};
}

//#endregion
//#region src/parser/inline-parsers/hardbreak-parser.ts
function parseHardbreakToken() {
	return {
		type: "hardbreak",
		raw: "\\\n"
	};
}

//#endregion
//#region src/parser/inline-parsers/highlight-parser.ts
function parseHighlightToken(tokens, startIndex, options) {
	const children = [];
	let markText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "mark_close") {
		markText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	return {
		node: {
			type: "highlight",
			children,
			raw: `==${markText}==`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/html-inline-code-parser.ts
let emptyTagSets = null;
const TAG_SET_CACHE = /* @__PURE__ */ new WeakMap();
function getEmptyTagSets() {
	if (!emptyTagSets) emptyTagSets = {
		customTagSet: null,
		allowedTagSet: buildAllowedHtmlTagSet()
	};
	return emptyTagSets;
}
function getTagName(html) {
	const match = html.match(/^<\s*(?:\/\s*)?([\w-]+)/);
	return match ? match[1].toLowerCase() : "";
}
function isClosingTag(html) {
	return /^<\s*\//.test(html);
}
function isSelfClosing(tag, html) {
	return /\/\s*>\s*$/.test(html) || VOID_HTML_TAGS.has(tag);
}
function getTagSets(customTags) {
	if (!customTags || customTags.length === 0) return getEmptyTagSets();
	const cached = TAG_SET_CACHE.get(customTags);
	if (cached) return cached;
	const normalized = customTags.map(normalizeCustomHtmlTagName).filter(Boolean);
	if (!normalized.length) {
		const entry$1 = getEmptyTagSets();
		TAG_SET_CACHE.set(customTags, entry$1);
		return entry$1;
	}
	const entry = {
		customTagSet: new Set(normalized),
		allowedTagSet: buildAllowedHtmlTagSet({ customHtmlTags: customTags })
	};
	TAG_SET_CACHE.set(customTags, entry);
	return entry;
}
function tokenToRaw(token) {
	const shape = token;
	const raw = shape.raw ?? shape.content ?? shape.markup ?? "";
	return String(raw ?? "");
}
function getCustomHtmlSourceMeta(token) {
	const meta = token.meta;
	const raw = meta?.markstreamCustomHtmlRaw;
	const inner = meta?.markstreamCustomHtmlInner;
	return typeof raw === "string" && typeof inner === "string" ? {
		raw,
		inner
	} : null;
}
function getAttrValue$1(attrs, name) {
	const lowerName = name.toLowerCase();
	for (let i = attrs.length - 1; i >= 0; i--) {
		const [key, value] = attrs[i];
		if (String(key).toLowerCase() === lowerName) return value;
	}
}
function normalizeLinkAttrs$1(attrs, href, title) {
	const normalized = attrs.slice();
	if (!getAttrValue$1(normalized, "href")) normalized.push(["href", href]);
	if (title != null && !getAttrValue$1(normalized, "title")) normalized.push(["title", title]);
	return normalized;
}
function stringifyTokens(tokens) {
	return tokens.map(tokenToRaw).join("");
}
function normalizeStandardHtmlChildren(children) {
	const normalized = [];
	const pushText = (rawText) => {
		const text$1 = String(rawText ?? "");
		if (!text$1) return;
		const last = normalized[normalized.length - 1];
		if (last?.type === "text") {
			last.content = `${last.content}${text$1}`;
			last.raw = `${last.raw}${text$1}`;
			return;
		}
		normalized.push({
			type: "text",
			content: text$1,
			raw: text$1
		});
	};
	for (const child of children) {
		if (!child) continue;
		if (child.type === "reference" || child.type === "footnote_reference") {
			pushText(String(child.raw ?? ""));
			continue;
		}
		if ("children" in child && Array.isArray(child.children)) {
			normalized.push({
				...child,
				children: normalizeStandardHtmlChildren(child.children)
			});
			continue;
		}
		normalized.push(child);
	}
	return normalized;
}
function findMatchingClosing(tokens, startIndex, tag) {
	let depth = 0;
	for (let idx = startIndex; idx < tokens.length; idx++) {
		const t = tokens[idx];
		if (t.type !== "html_inline") continue;
		const content = String(t.content ?? "");
		const tTag = getTagName(content);
		const closing = isClosingTag(content);
		const selfClosing = isSelfClosing(tTag, content);
		if (!closing && !selfClosing && tTag === tag) {
			depth++;
			continue;
		}
		if (closing && tTag === tag) {
			if (depth === 0) return idx;
			depth--;
		}
	}
	return -1;
}
function collectHtmlFragment(tokens, startIndex, tag) {
	const fragmentTokens = [tokens[startIndex]];
	let innerTokens = [];
	let nextIndex = startIndex + 1;
	let closed = false;
	const closingIndex = tag ? findMatchingClosing(tokens, startIndex + 1, tag) : -1;
	if (closingIndex !== -1) {
		innerTokens = tokens.slice(startIndex + 1, closingIndex);
		fragmentTokens.push(...innerTokens, tokens[closingIndex]);
		nextIndex = closingIndex + 1;
		closed = true;
	} else {
		innerTokens = tokens.slice(startIndex + 1);
		if (innerTokens.length) fragmentTokens.push(...innerTokens);
		nextIndex = tokens.length;
	}
	return {
		closed,
		html: stringifyTokens(fragmentTokens),
		innerTokens,
		nextIndex
	};
}
function parseHtmlInlineCodeToken(token, tokens, i, parseInlineTokens$1, raw, pPreToken, options) {
	const code$1 = String(token.content ?? "");
	const tag = getTagName(code$1);
	const { customTagSet, allowedTagSet } = getTagSets(options?.customHtmlTags);
	if (!tag) return [{
		type: "inline_code",
		code: code$1,
		raw: code$1
	}, i + 1];
	if (!allowedTagSet.has(tag)) {
		if (!collectHtmlFragment(tokens, i, tag).closed) {
			const content$1 = tokenToRaw(token);
			return [{
				type: "text",
				content: content$1,
				raw: content$1
			}, i + 1];
		}
	}
	if (tag === "br") return [{
		type: "hardbreak",
		raw: code$1
	}, i + 1];
	const closing = isClosingTag(code$1);
	const selfClosing = isSelfClosing(tag, code$1);
	if (closing) return [{
		type: "html_inline",
		tag,
		content: code$1,
		children: [],
		raw: code$1,
		loading: false
	}, i + 1];
	if (tag === "a") {
		const fragment$1 = collectHtmlFragment(tokens, i, tag);
		const attrs$1 = parseTagAttrs(code$1);
		const innerTokens = fragment$1.innerTokens;
		const href = String(getAttrValue$1(attrs$1, "href") ?? "");
		const titleAttr = getAttrValue$1(attrs$1, "title");
		const title = titleAttr == null ? null : String(titleAttr);
		const normalizedAttrs = normalizeLinkAttrs$1(attrs$1, href, title);
		const normalizedChildren$1 = normalizeStandardHtmlChildren(innerTokens.length ? parseInlineTokens$1(innerTokens, raw, pPreToken, options) : []);
		const textContent = innerTokens.length ? stringifyTokens(innerTokens) : href || "";
		if (!normalizedChildren$1.length && textContent) normalizedChildren$1.push({
			type: "text",
			content: textContent,
			raw: textContent
		});
		return [{
			type: "link",
			href,
			title,
			text: textContent,
			attrs: normalizedAttrs,
			children: normalizedChildren$1,
			loading: !fragment$1.closed,
			raw: fragment$1.html || code$1
		}, fragment$1.nextIndex];
	}
	if (selfClosing) return [{
		type: customTagSet?.has(tag) ? tag : "html_inline",
		tag,
		content: code$1,
		children: [],
		raw: code$1,
		loading: false
	}, i + 1];
	const fragment = collectHtmlFragment(tokens, i, tag);
	if (tag === "p" || tag === "div") return [{
		type: "paragraph",
		children: normalizeStandardHtmlChildren(fragment.innerTokens.length ? parseInlineTokens$1(fragment.innerTokens, raw, pPreToken, options) : []),
		raw: fragment.html
	}, fragment.nextIndex];
	const normalizedChildren = normalizeStandardHtmlChildren(fragment.innerTokens.length ? parseInlineTokens$1(fragment.innerTokens, raw, pPreToken, options) : []);
	let content = fragment.html || code$1;
	let loading = !fragment.closed;
	let autoClosed = false;
	if (!fragment.closed) {
		const closeTag = `</${tag}>`;
		if (!content.toLowerCase().includes(closeTag.toLowerCase())) content += closeTag;
		autoClosed = true;
		loading = true;
	}
	const attrs = [];
	const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let match;
	while ((match = attrRegex.exec(code$1)) !== null) {
		const attrName = match[1];
		const attrValue = match[2] || match[3] || match[4] || "";
		attrs.push([attrName, attrValue]);
	}
	if (customTagSet?.has(tag)) {
		const sourceMeta = getCustomHtmlSourceMeta(token);
		return [{
			type: tag,
			tag,
			attrs,
			content: sourceMeta ? sourceMeta.inner : fragment.innerTokens.length ? stringifyTokens(fragment.innerTokens) : "",
			children: fragment.innerTokens.length ? parseInlineTokens$1(fragment.innerTokens, raw, pPreToken, options) : [],
			raw: sourceMeta?.raw ?? content,
			loading: token.loading || loading,
			autoClosed
		}, fragment.nextIndex];
	}
	return [{
		type: "html_inline",
		tag,
		attrs,
		content,
		children: normalizedChildren,
		raw: content,
		loading,
		autoClosed
	}, fragment.nextIndex];
}

//#endregion
//#region src/parser/inline-parsers/image-parser.ts
function stringifyAltToken(token) {
	if (token.type === "math_inline") {
		if (token.raw) return String(token.raw);
		const markup = token.markup === "$$" ? "$$" : "$";
		return `${markup}${String(token.content ?? "")}${markup}`;
	}
	if (Array.isArray(token.children) && token.children.length > 0) return token.children.map((child) => stringifyAltToken(child)).join("");
	return String(token.content ?? "");
}
function getAltFromTokenChildren(token) {
	if (!token || !Array.isArray(token.children) || token.children.length === 0) return "";
	return token.children.map((child) => stringifyAltToken(child)).join("");
}
function parseImageToken(token, loading = false) {
	let attrs = token.attrs ?? [];
	let childWithAttrs = null;
	if ((!attrs || attrs.length === 0) && Array.isArray(token.children)) for (const child of token.children) {
		const childAttrs = child.attrs;
		if (Array.isArray(childAttrs) && childAttrs.length > 0) {
			attrs = childAttrs;
			childWithAttrs = child;
			break;
		}
	}
	const src = String(attrs.find((attr) => attr[0] === "src")?.[1] ?? "");
	const altAttr = attrs.find((attr) => attr[0] === "alt")?.[1];
	const childAlt = getAltFromTokenChildren(childWithAttrs ?? token);
	let alt = "";
	if (childAlt) alt = childAlt;
	else if (altAttr != null && String(altAttr).length > 0) alt = String(altAttr);
	else if (childWithAttrs?.content != null && String(childWithAttrs.content).length > 0) alt = String(childWithAttrs.content);
	else if (Array.isArray(childWithAttrs?.children) && childWithAttrs.children[0]?.content) alt = String(childWithAttrs.children[0].content);
	else if (Array.isArray(token.children) && token.children[0]?.content) alt = String(token.children[0].content);
	else if (token.content != null && String(token.content).length > 0) alt = String(token.content);
	const _title = attrs.find((attr) => attr[0] === "title")?.[1] ?? null;
	const title = _title === null ? null : String(_title);
	const raw = String(token.content ?? "");
	return {
		type: "image",
		src,
		alt,
		title,
		raw,
		loading
	};
}

//#endregion
//#region src/parser/inline-parsers/inline-code-parser.ts
function parseInlineCodeToken(token) {
	const code$1 = String(token.content ?? "");
	return {
		type: "inline_code",
		code: code$1,
		raw: code$1
	};
}

//#endregion
//#region src/parser/inline-parsers/insert-parser.ts
function parseInsertToken(tokens, startIndex, options) {
	const children = [];
	let insText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "ins_close") {
		insText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	return {
		node: {
			type: "insert",
			children,
			raw: `++${String(insText)}++`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/link-parser.ts
function toAttrsTuple(attrs) {
	const tuples = [];
	if (!Array.isArray(attrs)) return tuples;
	for (const attr of attrs) {
		const key = attr?.[0];
		if (!key) continue;
		tuples.push([String(key), String(attr?.[1] ?? "")]);
	}
	return tuples;
}
function getAttrValue(attrs, name) {
	const lowerName = name.toLowerCase();
	for (let i = attrs.length - 1; i >= 0; i--) {
		const [key, value] = attrs[i];
		if (String(key).toLowerCase() === lowerName) return value;
	}
}
function normalizeLinkAttrs(attrs, href, title) {
	const normalized = attrs.slice();
	if (!getAttrValue(normalized, "href")) normalized.push(["href", href]);
	if (title != null && !getAttrValue(normalized, "title")) normalized.push(["title", title]);
	return normalized;
}
function parseLinkToken(tokens, startIndex, options) {
	const openToken = tokens[startIndex];
	const attrsTuple = toAttrsTuple(openToken.attrs);
	const href = String(getAttrValue(attrsTuple, "href") ?? "");
	const _title = getAttrValue(attrsTuple, "title");
	const title = _title == null ? null : String(_title);
	const normalizedAttrs = normalizeLinkAttrs(attrsTuple, href, title);
	let i = startIndex + 1;
	const linkTokens = [];
	let loading = true;
	while (i < tokens.length && tokens[i].type !== "link_close") {
		linkTokens.push(tokens[i]);
		i++;
	}
	if (tokens[i]?.type === "link_close") loading = false;
	let childTokens = linkTokens;
	const lastLinkToken = linkTokens[linkTokens.length - 1];
	if (options?.__insideStrong && lastLinkToken?.type === "text" && String(lastLinkToken.content ?? "").endsWith("**") && !linkTokens.some((token) => token.type === "strong_open")) {
		const originalContent = String(lastLinkToken.content ?? "");
		const originalRaw = String(lastLinkToken.raw ?? originalContent);
		const adjustedLastLinkToken = cloneTokenWithMutableChildren(lastLinkToken);
		adjustedLastLinkToken.content = originalContent.slice(0, -2);
		adjustedLastLinkToken.raw = originalRaw.replace(/\*\*$/, "");
		childTokens = linkTokens.slice();
		childTokens[childTokens.length - 1] = adjustedLastLinkToken;
	}
	const children = parseInlineTokens(childTokens, void 0, void 0, options);
	const linkText = children.map((node) => {
		const nodeAny = node;
		if ("content" in node) return String(nodeAny.content ?? "");
		return String(nodeAny.raw ?? "");
	}).join("");
	return {
		node: {
			type: "link",
			href,
			title,
			text: linkText,
			children,
			raw: String(`[${linkText}](${href}${title ? ` "${title}"` : ""})`),
			loading,
			attrs: normalizedAttrs
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/math-inline-parser.ts
function parseMathInlineToken(token) {
	const content = token.content ?? "";
	const raw = token.raw === "$$" ? `$${content}$` : token.raw || "";
	return {
		type: "math_inline",
		content,
		loading: !!token.loading,
		raw,
		markup: token.markup
	};
}

//#endregion
//#region src/parser/inline-parsers/reference-parser.ts
function parseReferenceToken(token) {
	return {
		type: "reference",
		id: String(token.content ?? ""),
		raw: String(token.markup ?? `[${token.content ?? ""}]`)
	};
}

//#endregion
//#region src/parser/inline-parsers/strikethrough-parser.ts
function parseStrikethroughToken(tokens, startIndex, options) {
	const children = [];
	let sText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "s_close") {
		sText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	return {
		node: {
			type: "strikethrough",
			children,
			raw: `~~${sText}~~`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/strong-parser.ts
const ESCAPED_PUNCTUATION_RE$1 = /\\([\\()[\]`$|*_\-!])/g;
function resolveInnerRaw(raw, strongText) {
	if (!raw) return void 0;
	const rawText = String(raw);
	if (!rawText) return void 0;
	if (rawText === strongText) return rawText;
	if (rawText.replace(ESCAPED_PUNCTUATION_RE$1, "$1") === strongText) return rawText;
}
function parseStrongToken(tokens, startIndex, raw, options) {
	const children = [];
	let strongText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	let openCount = 1;
	while (i < tokens.length) {
		if (tokens[i].type === "strong_close") {
			if (openCount === 1) break;
			openCount--;
		}
		if (tokens[i].type === "strong_open") openCount++;
		strongText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	const innerOptions = {
		...options,
		__insideStrong: true
	};
	children.push(...parseInlineTokens(innerTokens, resolveInnerRaw(raw, strongText), void 0, innerOptions));
	return {
		node: {
			type: "strong",
			children,
			raw: `**${String(strongText)}**`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/subscript-parser.ts
function parseSubscriptToken(tokens, startIndex, options) {
	const children = [];
	let subText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "sub_close") {
		subText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	const startContent = String(tokens[startIndex].content ?? "");
	const display = subText || startContent;
	return {
		node: {
			type: "subscript",
			children: children.length > 0 ? children : [{
				type: "text",
				content: display,
				raw: display
			}],
			raw: `~${display}~`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/superscript-parser.ts
function parseSuperscriptToken(tokens, startIndex, options) {
	const children = [];
	let supText = "";
	let i = startIndex + 1;
	const innerTokens = [];
	while (i < tokens.length && tokens[i].type !== "sup_close") {
		supText += String(tokens[i].content ?? "");
		innerTokens.push(tokens[i]);
		i++;
	}
	children.push(...parseInlineTokens(innerTokens, void 0, void 0, options));
	return {
		node: {
			type: "superscript",
			children: children.length > 0 ? children : [{
				type: "text",
				content: supText || String(tokens[startIndex].content ?? ""),
				raw: supText || String(tokens[startIndex].content ?? "")
			}],
			raw: `^${supText || String(tokens[startIndex].content ?? "")}^`
		},
		nextIndex: i < tokens.length ? i + 1 : tokens.length
	};
}

//#endregion
//#region src/parser/inline-parsers/text-parser.ts
function parseTextToken(token) {
	const content = String(token.content ?? "");
	return {
		type: "text",
		content,
		raw: content
	};
}

//#endregion
//#region src/parser/inline-parsers/index.ts
const STRIKETHROUGH_RE = /[^~]*~{2,}[^~]+/;
const HAS_STRONG_RE = /\*\*/;
const INLINE_REPARSE_MARKER_RE = /[[_*^~]/;
const ESCAPED_PUNCTUATION_RE = /\\([\\()[\]`$|*_\-!])/g;
const ESCAPABLE_PUNCTUATION = new Set([
	"\\",
	"(",
	")",
	"[",
	"]",
	"`",
	"$",
	"|",
	"*",
	"_",
	"-",
	"!"
]);
const WHITESPACE_RE = /\s/u;
const ASCII_PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const UNICODE_PUNCTUATION_RE = /\p{P}/u;
const AUTOLINK_PROTOCOL_RE = /^(?:https?:\/\/|mailto:|ftp:\/\/)/i;
const AUTOLINK_GENERIC_RE = /:\/\//;
function countUnescapedAsterisks(str) {
	let count = 0;
	let i = 0;
	while (i < str.length) {
		if (str[i] === "\\" && i + 1 < str.length && str[i + 1] === "*") {
			i += 2;
			continue;
		}
		if (str[i] === "*") count++;
		i++;
	}
	return count;
}
function findNextUnescapedAsterisk(rawContent, startContentIndex = 0) {
	if (!rawContent) return -1;
	let contentIndex = 0;
	for (let rawIndex = 0; rawIndex < rawContent.length; rawIndex++) {
		const char = rawContent[rawIndex];
		const nextChar = rawContent[rawIndex + 1];
		if (char === "\\" && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
			if (nextChar === "*" && contentIndex >= startContentIndex) {
				contentIndex++;
				rawIndex++;
				continue;
			}
			contentIndex++;
			rawIndex++;
			continue;
		}
		if (char === "*" && contentIndex >= startContentIndex) return contentIndex;
		contentIndex++;
	}
	return -1;
}
function isWhitespaceChar(ch) {
	return !!ch && WHITESPACE_RE.test(ch);
}
function isPunctuationChar(ch) {
	return !!ch && (ASCII_PUNCTUATION_RE.test(ch) || UNICODE_PUNCTUATION_RE.test(ch));
}
function isEmphasisOpenDelimiter(content, index) {
	const prev = index > 0 ? content[index - 1] : void 0;
	const next = content[index + 1];
	if (!next || isWhitespaceChar(next)) return false;
	return !(isPunctuationChar(next) && !!prev && !isWhitespaceChar(prev) && !isPunctuationChar(prev));
}
function isEmphasisCloseDelimiter(content, index) {
	const prev = index > 0 ? content[index - 1] : void 0;
	const next = content[index + 1];
	if (!prev || isWhitespaceChar(prev)) return false;
	return !(isPunctuationChar(prev) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next));
}
function findNextUnescapedEmphasisClose(rawContent, content, startContentIndex = 0) {
	let searchIndex = startContentIndex;
	let sawInvalidClose = false;
	while (searchIndex < content.length) {
		const closeIndex = rawContent ? findNextUnescapedAsterisk(rawContent, searchIndex) : content.indexOf("*", searchIndex);
		if (closeIndex === -1) break;
		if (isEmphasisCloseDelimiter(content, closeIndex)) return {
			index: closeIndex,
			sawInvalidClose
		};
		sawInvalidClose = true;
		searchIndex = closeIndex + 1;
	}
	return {
		index: -1,
		sawInvalidClose
	};
}
function isStrongOpenDelimiter(content, index) {
	const prev = index > 0 ? content[index - 1] : void 0;
	const next = content[index + 2];
	if (!next || isWhitespaceChar(next)) return false;
	return !(isPunctuationChar(next) && !!prev && !isWhitespaceChar(prev) && !isPunctuationChar(prev));
}
function isStrongCloseDelimiter(content, index) {
	const prev = index > 0 ? content[index - 1] : void 0;
	const next = content[index + 2];
	if (!prev || isWhitespaceChar(prev)) return false;
	return !(isPunctuationChar(prev) && !!next && !isWhitespaceChar(next) && !isPunctuationChar(next));
}
function findNextStrongClose(content, startContentIndex = 0) {
	let searchIndex = startContentIndex;
	let sawInvalidClose = false;
	while (searchIndex < content.length) {
		const closeIndex = content.indexOf("**", searchIndex);
		if (closeIndex === -1) break;
		if (isStrongCloseDelimiter(content, closeIndex)) return {
			index: closeIndex,
			sawInvalidClose
		};
		sawInvalidClose = true;
		searchIndex = closeIndex + 2;
	}
	return {
		index: -1,
		sawInvalidClose
	};
}
function decodeVisibleTextFromRaw(rawText) {
	let output = "";
	let index = 0;
	while (index < rawText.length) {
		if (rawText[index] !== "\\") {
			output += rawText[index];
			index++;
			continue;
		}
		let slashCount = 0;
		while (index + slashCount < rawText.length && rawText[index + slashCount] === "\\") slashCount++;
		const nextChar = rawText[index + slashCount];
		output += "\\".repeat(Math.floor(slashCount / 2));
		if (slashCount % 2 === 1) {
			if (nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
				output += nextChar;
				index += slashCount + 1;
				continue;
			}
			output += "\\";
		}
		index += slashCount;
	}
	return output;
}
function getRawIndexForVisibleIndex(rawText, visibleIndex) {
	let outputIndex = 0;
	for (let rawIndex = 0; rawIndex < rawText.length; rawIndex++) {
		const char = rawText[rawIndex];
		const nextChar = rawText[rawIndex + 1];
		if (char === "\\" && nextChar && ESCAPABLE_PUNCTUATION.has(nextChar)) {
			if (outputIndex === visibleIndex) return rawIndex + 1;
			outputIndex++;
			rawIndex++;
			continue;
		}
		if (outputIndex === visibleIndex) return rawIndex;
		outputIndex++;
	}
	return -1;
}
function isEscapedVisibleChar(rawText, visibleIndex, expectedChar) {
	const rawIndex = getRawIndexForVisibleIndex(rawText, visibleIndex);
	if (rawIndex === -1) return false;
	if (expectedChar && rawText[rawIndex] !== expectedChar) return false;
	let slashCount = 0;
	for (let i = rawIndex - 1; i >= 0 && rawText[i] === "\\"; i--) slashCount++;
	return slashCount % 2 === 1;
}
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const WORD_ONLY_RE = /^[\p{L}\p{N}]+$/u;
function isWordChar(ch) {
	if (!ch) return false;
	return WORD_CHAR_RE.test(ch);
}
function isWordOnly(text$1) {
	if (!text$1) return false;
	return WORD_ONLY_RE.test(text$1);
}
function getAsteriskRunInfo(content, start) {
	let end = start;
	while (end < content.length && content[end] === "*") end++;
	const prev = start > 0 ? content[start - 1] : void 0;
	const next = end < content.length ? content[end] : void 0;
	return {
		len: end - start,
		prev,
		next,
		intraword: isWordChar(prev) && isWordChar(next)
	};
}
function findLiteralIntrawordAsteriskRunPairEnd(content) {
	const runs = [];
	for (let index = 0; index < content.length;) {
		if (content[index] !== "*") {
			index++;
			continue;
		}
		const info = getAsteriskRunInfo(content, index);
		const end = index + info.len;
		if (info.len >= 2 && info.intraword) runs.push({
			start: index,
			end
		});
		index = end;
	}
	for (let index = 0; index < runs.length - 1; index++) {
		const current = runs[index];
		const next = runs[index + 1];
		if (!isWordOnly(content.slice(current.end, next.start))) return next.end;
	}
	return -1;
}
function isTripleAsteriskInnerText(text$1) {
	return !!text$1 && text$1.trim() === text$1 && /^[\p{L}\p{N}\s]+$/u.test(text$1);
}
function findTripleAsteriskClose(content, start) {
	let searchIndex = start;
	while (searchIndex < content.length) {
		const index = content.indexOf("***", searchIndex);
		if (index === -1) return -1;
		const info = getAsteriskRunInfo(content, index);
		if (info.len >= 3) return index;
		searchIndex = index + info.len;
	}
	return -1;
}
function isLikelyUrl(href) {
	if (!href) return false;
	return AUTOLINK_PROTOCOL_RE.test(href) || AUTOLINK_GENERIC_RE.test(href);
}
function recoverTrailingMarkdownLinkLabel(raw, href) {
	if (!raw || !href) return null;
	const match = raw.match(/\[([^\]\n]+)\]\(([^)]*)$/);
	if (!match) return null;
	return match[2] === href ? match[1] : null;
}
function parseInlineTokens(tokens, raw, pPreToken, options) {
	if (!tokens || tokens.length === 0) return [];
	const inheritedContext = options?.__linkifyDemotionContext;
	const inferredContext = inferLinkifyDemotionContext(raw);
	const linkifyDemotionContext = {
		filename: inheritedContext?.filename || inferredContext.filename,
		explicitFilename: inheritedContext?.explicitFilename || inferredContext.explicitFilename,
		marketTicker: inheritedContext?.marketTicker || inferredContext.marketTicker
	};
	if (linkifyDemotionContext.filename || linkifyDemotionContext.explicitFilename || linkifyDemotionContext.marketTicker) options = {
		...options,
		__linkifyDemotionContext: linkifyDemotionContext
	};
	const internalOptions = options;
	const result = [];
	let currentTextNode = null;
	let i = 0;
	const requireClosingStrong = options?.requireClosingStrong;
	const originalTokens = tokens;
	function ensureWorkingTokens() {
		if (tokens === originalTokens) tokens = tokens.slice();
		return tokens;
	}
	function resetCurrentTextNode() {
		currentTextNode = null;
	}
	function handleEmphasisAndStrikethrough(content, token) {
		const rawSource = tokens.length === 1 ? raw : String(token.content ?? "");
		const markerCandidates = [];
		const literalIntrawordRunPairEnd = findLiteralIntrawordAsteriskRunPairEnd(content);
		if (literalIntrawordRunPairEnd !== -1) {
			pushText(content.slice(0, literalIntrawordRunPairEnd), content.slice(0, literalIntrawordRunPairEnd));
			const afterContent = content.slice(literalIntrawordRunPairEnd);
			if (afterContent) {
				handleToken({
					type: "text",
					content: afterContent,
					raw: afterContent
				});
				i--;
			}
			i++;
			return true;
		}
		if (STRIKETHROUGH_RE.test(content)) {
			const idx = content.indexOf("~~");
			if (idx !== -1) markerCandidates.push({
				type: "strikethrough",
				index: idx
			});
		}
		if (HAS_STRONG_RE.test(content)) {
			const idx = content.indexOf("**");
			if (idx !== -1) markerCandidates.push({
				type: "strong",
				index: idx
			});
		}
		if (/[^*]*\*[^*]+/.test(content)) {
			const idx = rawSource ? findNextUnescapedAsterisk(rawSource, 0) : content.indexOf("*");
			if (rawSource && idx === -1) return false;
			if (idx !== -1) markerCandidates.push({
				type: "emphasis",
				index: idx
			});
		}
		markerCandidates.sort((a, b) => {
			if (a.index !== b.index) return a.index - b.index;
			if (a.type === b.type) return 0;
			if (a.type === "strong") return -1;
			if (b.type === "strong") return 1;
			return 0;
		});
		const nextMarker = markerCandidates[0];
		if (!nextMarker) return false;
		if (nextMarker.type === "strikethrough") {
			const idx = nextMarker.index;
			const beforeText = idx > -1 ? content.slice(0, idx) : "";
			if (beforeText) pushText(beforeText, beforeText);
			if (idx === -1) {
				i++;
				return true;
			}
			const closeIdx = content.indexOf("~~", idx + 2);
			const inner = closeIdx === -1 ? content.slice(idx + 2) : content.slice(idx + 2, closeIdx);
			const after = closeIdx === -1 ? "" : content.slice(closeIdx + 2);
			const { node } = parseStrikethroughToken([
				{
					type: "s_open",
					tag: "s",
					content: "",
					markup: "~~",
					info: "",
					meta: null
				},
				{
					type: "text",
					tag: "",
					content: inner,
					markup: "",
					info: "",
					meta: null
				},
				{
					type: "s_close",
					tag: "s",
					content: "",
					markup: "~~",
					info: "",
					meta: null
				}
			], 0, options);
			resetCurrentTextNode();
			pushNode(node);
			if (after) {
				handleToken({
					type: "text",
					content: after,
					raw: after
				});
				i--;
			}
			i++;
			return true;
		}
		if (nextMarker.type === "strong") {
			const openIdx = nextMarker.index;
			const beforeText = openIdx > -1 ? content.slice(0, openIdx) : "";
			if (beforeText) pushText(beforeText, beforeText);
			if (openIdx === -1) {
				i++;
				return true;
			}
			if (raw && openIdx === 0) {
				let rawHasEscapedAsteriskAtStart = false;
				let asteriskCount = 0;
				while (asteriskCount < content.length && content[asteriskCount] === "*") asteriskCount++;
				if (raw.startsWith("\\*")) rawHasEscapedAsteriskAtStart = true;
				if (rawHasEscapedAsteriskAtStart) {
					let escapedCount = 0;
					let j = 0;
					while (j < raw.length && escapedCount < asteriskCount) if (raw[j] === "\\" && j + 1 < raw.length && raw[j + 1] === "*") {
						escapedCount += 1;
						j += 2;
					} else if (raw[j] === "*") break;
					else j++;
					if (escapedCount >= 2) {
						pushText(content, content);
						i++;
						return true;
					}
				}
			}
			if (raw) {
				if ((content.match(/\*/g) || []).length > countUnescapedAsterisks(raw)) {
					pushText(content.slice(beforeText.length), content.slice(beforeText.length));
					i++;
					return true;
				}
			}
			const runInfo = getAsteriskRunInfo(content, openIdx);
			if (runInfo.len >= 3) {
				const closeIndex = findTripleAsteriskClose(content, openIdx + runInfo.len);
				if (closeIndex !== -1) {
					const inner$1 = content.slice(openIdx + runInfo.len, closeIndex);
					if (isTripleAsteriskInnerText(inner$1)) {
						const { node: node$1 } = parseStrongToken([
							{
								type: "strong_open",
								tag: "strong",
								content: "",
								markup: "**",
								info: "",
								meta: null
							},
							{
								type: "em_open",
								tag: "em",
								content: "",
								markup: "*",
								info: "",
								meta: null
							},
							{
								type: "text",
								tag: "",
								content: inner$1,
								markup: "",
								info: "",
								meta: null
							},
							{
								type: "em_close",
								tag: "em",
								content: "",
								markup: "*",
								info: "",
								meta: null
							},
							{
								type: "strong_close",
								tag: "strong",
								content: "",
								markup: "**",
								info: "",
								meta: null
							}
						], 0, raw, options);
						resetCurrentTextNode();
						pushNode(node$1);
						const afterContent = content.slice(closeIndex + 3);
						if (afterContent) {
							handleToken({
								type: "text",
								content: afterContent,
								raw: afterContent
							});
							i--;
						}
						i++;
						return true;
					}
				}
			}
			if (!isStrongOpenDelimiter(content, openIdx)) {
				const literalRun = content.slice(openIdx, openIdx + runInfo.len);
				pushText(literalRun, literalRun);
				const afterContent = content.slice(openIdx + runInfo.len);
				if (afterContent) {
					handleToken({
						type: "text",
						content: afterContent,
						raw: afterContent
					});
					i--;
				}
				i++;
				return true;
			}
			const close = findNextStrongClose(content, openIdx + 2);
			let inner = "";
			let after = "";
			if (close.index !== -1) {
				inner = content.slice(openIdx + 2, close.index);
				after = content.slice(close.index + 2);
				const closeIdx = close.index;
				const closeRunInfo = getAsteriskRunInfo(content, closeIdx);
				if (runInfo.intraword && closeRunInfo.intraword && !isWordOnly(inner)) {
					pushText(content.slice(beforeText.length), content.slice(beforeText.length));
					i++;
					return true;
				}
				if (!inner && runInfo.len >= 4 && runInfo.intraword) {
					pushText(content.slice(beforeText.length), content.slice(beforeText.length));
					i++;
					return true;
				}
			} else {
				if (requireClosingStrong || close.sawInvalidClose) {
					pushText(content.slice(beforeText.length), content.slice(beforeText.length));
					i++;
					return true;
				}
				if (runInfo.intraword) {
					pushText(content.slice(beforeText.length), content.slice(beforeText.length));
					i++;
					return true;
				}
				inner = content.slice(openIdx + 2);
				after = "";
			}
			if (!inner && /^\*+$/.test(after)) {
				pushText(content, content);
				i++;
				return true;
			}
			const { node } = parseStrongToken([
				{
					type: "strong_open",
					tag: "strong",
					content: "",
					markup: "**",
					info: "",
					meta: null
				},
				{
					type: "text",
					tag: "",
					content: inner,
					markup: "",
					info: "",
					meta: null
				},
				{
					type: "strong_close",
					tag: "strong",
					content: "",
					markup: "**",
					info: "",
					meta: null
				}
			], 0, raw, options);
			resetCurrentTextNode();
			pushNode(node);
			if (after) {
				handleToken({
					type: "text",
					content: after,
					raw: after
				});
				i--;
			}
			i++;
			return true;
		}
		if (nextMarker.type === "emphasis") {
			let idx = nextMarker.index;
			if (idx === -1) idx = 0;
			const _text = content.slice(0, idx);
			if (_text) pushText(_text, _text);
			if (!isEmphasisOpenDelimiter(content, idx)) {
				pushText(content[idx], content[idx]);
				const afterContent = content.slice(idx + 1);
				if (afterContent) {
					handleToken({
						type: "text",
						content: afterContent,
						raw: afterContent
					});
					i--;
				}
				i++;
				return true;
			}
			const runInfo = getAsteriskRunInfo(content, idx);
			const close = findNextUnescapedEmphasisClose(rawSource, content, idx + 1);
			const closeIndex = close.index;
			const nextInlineToken = tokens[i + 1];
			if (options?.final && nextInlineToken?.type === "em_open" && closeIndex !== -1 && content.slice(idx + 1, closeIndex).trim() !== content.slice(idx + 1, closeIndex)) {
				pushText(content.slice(idx), content.slice(idx));
				i++;
				return true;
			}
			if (closeIndex === -1 && (close.sawInvalidClose || options?.final || runInfo.intraword || !isWordChar(content[idx + 1]))) {
				pushText(content.slice(idx), content.slice(idx));
				i++;
				return true;
			}
			const { node } = parseEmphasisToken([
				{
					type: "em_open",
					tag: "em",
					content: "",
					markup: "*",
					info: "",
					meta: null
				},
				{
					type: "text",
					tag: "",
					content: closeIndex > -1 ? content.slice(idx + 1, closeIndex) : content.slice(idx + 1),
					markup: "",
					info: "",
					meta: null
				},
				{
					type: "em_close",
					tag: "em",
					content: "",
					markup: "*",
					info: "",
					meta: null
				}
			], 0, options);
			resetCurrentTextNode();
			pushNode(node);
			if (closeIndex !== -1 && closeIndex < content.length - 1) {
				const afterContent = content.slice(closeIndex + 1);
				if (afterContent) {
					handleToken({
						type: "text",
						content: afterContent,
						raw: afterContent
					});
					i--;
				}
			}
			i++;
			return true;
		}
		return false;
	}
	function handleInlineCodeContent(content, _token) {
		if (!content.includes("`")) return false;
		const findFirstUnescapedBacktick = (src) => {
			for (let idx = 0; idx < src.length; idx++) {
				if (src[idx] !== "`") continue;
				let slashCount = 0;
				for (let j = idx - 1; j >= 0 && src[j] === "\\"; j--) slashCount++;
				if (slashCount % 2 === 0) return idx;
			}
			return -1;
		};
		const codeStart = findFirstUnescapedBacktick(content);
		if (codeStart === -1) return false;
		let runLen = 1;
		for (let k = codeStart + 1; k < content.length && content[k] === "`"; k++) runLen++;
		const closingSeq = "`".repeat(runLen);
		const searchFrom = codeStart + runLen;
		const codeEnd = content.indexOf(closingSeq, searchFrom);
		if (codeEnd === -1) {
			if (runLen === 1) {
				const beforeText$1 = content.slice(0, codeStart);
				const codeContent$1 = content.slice(codeStart + 1);
				if (beforeText$1) if (!handleEmphasisAndStrikethrough(beforeText$1, _token)) pushText(beforeText$1, beforeText$1);
				else i--;
				pushParsed({
					type: "inline_code",
					code: codeContent$1,
					raw: String(codeContent$1)
				});
				i++;
				return true;
			}
			let merged = content;
			for (let j = i + 1; j < tokens.length; j++) merged += String((tokens[j].content ?? "") + (tokens[j].markup ?? ""));
			i = tokens.length - 1;
			pushText(merged, merged);
			i++;
			return true;
		}
		resetCurrentTextNode();
		const beforeText = content.slice(0, codeStart);
		const codeContent = content.slice(codeStart + runLen, codeEnd);
		const after = content.slice(codeEnd + runLen);
		if (beforeText) if (!handleEmphasisAndStrikethrough(beforeText, _token)) pushText(beforeText, beforeText);
		else i--;
		pushParsed({
			type: "inline_code",
			code: codeContent,
			raw: String(codeContent ?? "")
		});
		if (after) {
			handleToken({
				type: "text",
				content: after,
				raw: after
			});
			i--;
		}
		i++;
		return true;
	}
	function tryReparseCollapsedInlineText(rawContent) {
		const md = internalOptions?.__markdownIt;
		if (!md) return null;
		if (tokens.length <= 1 || !tokens.some((token) => token?.type === "math_inline")) return null;
		if (!INLINE_REPARSE_MARKER_RE.test(rawContent)) return null;
		const reparsed = md.parseInline(rawContent, { __markstreamFinal: !!options?.final });
		if (!Array.isArray(reparsed) || reparsed.length === 0) return null;
		const children = (reparsed.find((token) => token?.type === "inline")?.children ?? []).filter((child) => !(child?.type === "text" && String(child.content ?? "") === ""));
		if (!children.length) return null;
		if (!children.some((child) => child?.type !== "text")) return null;
		if (children.length === 1 && children[0]?.type === "text" && String(children[0].content ?? "") === rawContent) return null;
		const reparsedNodes = parseInlineTokens(children, rawContent, pPreToken, options);
		return reparsedNodes.length ? reparsedNodes : null;
	}
	function pushParsed(node) {
		resetCurrentTextNode();
		result.push(node);
	}
	function pushToken(token) {
		resetCurrentTextNode();
		const node = cloneTokenWithMutableChildren(token);
		result.push(node);
	}
	function pushNode(node) {
		pushParsed(node);
	}
	function pushText(content, raw$1) {
		if (currentTextNode) {
			currentTextNode.content += content;
			currentTextNode.raw += raw$1 ?? content;
		} else {
			currentTextNode = {
				type: "text",
				content: String(content ?? ""),
				raw: String(raw$1 ?? content ?? "")
			};
			result.push(currentTextNode);
		}
	}
	function pushInlineTextContent(content, token) {
		if (!content) return;
		const parsed = parseInlineTokens([{
			...token,
			type: "text",
			content,
			raw: content
		}], content, pPreToken, options);
		if (parsed.length === 1 && parsed[0]?.type === "text") {
			const text$1 = parsed[0];
			pushText(String(text$1.content ?? ""), String(text$1.raw ?? text$1.content ?? ""));
			return;
		}
		for (const node of parsed) pushNode(node);
	}
	function hasEscapedMarkup(token, escapedPrefix) {
		return String(token.markup ?? "").startsWith(escapedPrefix);
	}
	function isMarkdownLinkBeforeLinkifiedUrl(content) {
		if (!content.endsWith("](")) return false;
		return tokens[i + 1]?.type === "link_open" && tokens[i + 1]?.markup === "linkify" && tokens[i + 2]?.type === "text" && tokens[i + 3]?.type === "link_close" && tokens[i + 4]?.type === "text" && String(tokens[i + 4]?.content ?? "").startsWith(")");
	}
	function stripTrailingMidStateMarker(content, token) {
		let nextContent = content;
		const rawTokenContent = String(token.content ?? "");
		if (nextContent.endsWith("\\") && !hasEscapedMarkup(token, "\\\\") && !rawTokenContent.endsWith("\\\\")) nextContent = nextContent.slice(0, -1);
		if (nextContent.endsWith("(") && !hasEscapedMarkup(token, "\\(") && !rawTokenContent.endsWith("\\(")) nextContent = nextContent.slice(0, -1);
		if (/\*+$/.test(nextContent) && !hasEscapedMarkup(token, "\\*") && !rawTokenContent.endsWith("\\*")) nextContent = nextContent.replace(/\*+$/, "");
		return nextContent;
	}
	while (i < tokens.length) {
		const token = tokens[i];
		handleToken(token);
	}
	function handleToken(token) {
		switch (token.type) {
			case "text":
				handleTextToken(token);
				break;
			case "softbreak":
				if (currentTextNode) {
					currentTextNode.content += "\n";
					currentTextNode.raw += "\n";
				} else {
					currentTextNode = {
						type: "text",
						content: "\n",
						raw: "\n"
					};
					result.push(currentTextNode);
				}
				i++;
				break;
			case "code_inline":
				pushNode(parseInlineCodeToken(token));
				i++;
				break;
			case "html_inline": {
				const [node, index] = parseHtmlInlineCodeToken(token, tokens, i, parseInlineTokens, raw, pPreToken, options);
				pushNode(node);
				i = index;
				break;
			}
			case "link_open":
				handleLinkOpen(token);
				break;
			case "image":
				if (!recoverOuterImageLinkStartFromImageToken(token)) {
					resetCurrentTextNode();
					pushNode(parseImageToken(token));
					i++;
				}
				break;
			case "strong_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseStrongToken(tokens, i, token.content, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "em_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseEmphasisToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "s_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseStrikethroughToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "mark_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseHighlightToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "ins_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseInsertToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "sub_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseSubscriptToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "sup_open": {
				resetCurrentTextNode();
				const { node, nextIndex } = parseSuperscriptToken(tokens, i, options);
				pushNode(node);
				i = nextIndex;
				break;
			}
			case "sub":
				resetCurrentTextNode();
				pushNode({
					type: "subscript",
					children: [{
						type: "text",
						content: String(token.content ?? ""),
						raw: String(token.content ?? "")
					}],
					raw: `~${String(token.content ?? "")}~`
				});
				i++;
				break;
			case "sup":
				resetCurrentTextNode();
				pushNode({
					type: "superscript",
					children: [{
						type: "text",
						content: String(token.content ?? ""),
						raw: String(token.content ?? "")
					}],
					raw: `^${String(token.content ?? "")}^`
				});
				i++;
				break;
			case "emoji": {
				resetCurrentTextNode();
				const preToken = tokens[i - 1];
				if (preToken?.type === "text" && /\|:-+/.test(String(preToken.content ?? ""))) pushText("", "");
				else pushNode(parseEmojiToken(token));
				i++;
				break;
			}
			case "checkbox":
				resetCurrentTextNode();
				pushNode(parseCheckboxToken(token));
				i++;
				break;
			case "checkbox_input":
				resetCurrentTextNode();
				pushNode(parseCheckboxInputToken(token));
				i++;
				break;
			case "footnote_ref":
				resetCurrentTextNode();
				pushNode(parseFootnoteRefToken(token));
				i++;
				break;
			case "footnote_anchor": {
				resetCurrentTextNode();
				const meta = token.meta ?? {};
				pushParsed({
					type: "footnote_anchor",
					id: String(meta.label ?? token.content ?? ""),
					raw: String(token.content ?? "")
				});
				i++;
				break;
			}
			case "hardbreak":
				resetCurrentTextNode();
				pushNode(parseHardbreakToken());
				i++;
				break;
			case "fence":
				resetCurrentTextNode();
				pushNode(parseFenceToken(tokens[i]));
				i++;
				break;
			case "math_inline":
				resetCurrentTextNode();
				if (!token.content && token.markup === "$" && tokens[i + 1]?.type === "text" && tokens[i + 2]?.type === "math_inline") {
					pushNode(parseMathInlineToken({
						...token,
						content: tokens[i + 1].content
					}));
					i += 2;
				} else pushNode(parseMathInlineToken(token));
				i++;
				break;
			case "reference":
				handleReference(token);
				break;
			case "text_special":
				pushText(String(token.content ?? ""), String(token.content ?? ""));
				i++;
				break;
			default: {
				const syntheticLink = token;
				if (token.type === "link" && syntheticLink.href != null && options?.validateLink && !options.validateLink(String(syntheticLink.href))) {
					resetCurrentTextNode();
					const displayText = String(syntheticLink.text ?? "");
					pushText(displayText, displayText);
					i++;
				} else if (recoverOuterImageLinkFromSyntheticLinkToken(token)) i++;
				else if (recoverMarkdownImageFromLoadingImageTail(token)) i++;
				else if (recoverMarkdownImageFromTrailingBang(token)) i++;
				else if (recoverMarkdownLinkFromTrailingText(token)) i++;
				else {
					pushToken(token);
					i++;
				}
				break;
			}
		}
	}
	function commitTextNode(content, token, preToken, nextToken) {
		const textNode = parseTextToken({
			...token,
			content
		});
		if (currentTextNode) {
			currentTextNode.content += stripTrailingMidStateMarker(textNode.content, token);
			currentTextNode.raw += textNode.raw;
			return;
		}
		const maybeMath = preToken?.tag === "br" && tokens[i - 2]?.content === "[";
		if (!nextToken) textNode.content = stripTrailingMidStateMarker(textNode.content, token);
		currentTextNode = textNode;
		currentTextNode.center = maybeMath;
		result.push(currentTextNode);
	}
	function handleTextToken(token) {
		const rawContent = String(token.content ?? "");
		const rawSource = tokens.length === 1 && rawContent.includes("\\") && typeof raw === "string" ? String(raw) : "";
		let content = rawSource ? decodeVisibleTextFromRaw(rawSource) : rawContent.replace(ESCAPED_PUNCTUATION_RE, "$1");
		if (token.content === "<" || content === "1" && tokens[i - 1]?.tag === "br") {
			i++;
			return;
		}
		const dollarIndex = content.indexOf("$");
		if (dollarIndex !== -1 && dollarIndex === content.lastIndexOf("$") && content.endsWith("$")) content = content.slice(0, -1);
		if (content.endsWith("undefined") && !raw?.endsWith("undefined")) content = content.slice(0, -9);
		let trailingTextStart = result.length;
		let trailingTextContent = "";
		for (let index = result.length - 1; index >= 0; index--) {
			const item = result[index];
			if (item.type !== "text") break;
			trailingTextStart = index;
			trailingTextContent = String(item.content ?? "") + trailingTextContent;
		}
		if (trailingTextStart < result.length) if (content.startsWith(trailingTextContent)) {
			currentTextNode = null;
			result.length = trailingTextStart;
		} else currentTextNode = result[result.length - 1];
		const nextToken = tokens[i + 1];
		if ((content === "`" || content === "|" || content === "$") && !hasEscapedMarkup(token, `\\${content}`) || /^\*+$/.test(content) && !hasEscapedMarkup(token, "\\*")) {
			i++;
			return;
		}
		if (!nextToken && /[^\]]\s*\(\s*$/.test(content)) content = content.replace(/\(\s*$/, "");
		if (!content) {
			i++;
			return;
		}
		if (recoverOuterImageLinkFromRawText(content)) return;
		if (recoverOuterImageLinkMidStateFromText(content)) return;
		if (!(content.includes("*") || content.includes("_") || content.includes("~") || content.includes("`") || content.includes("[") || content.includes("!") || content.includes("$") || content.includes("|") || content.includes("("))) {
			commitTextNode(content, token, tokens[i - 1], nextToken);
			i++;
			return;
		}
		if (handleCheckboxLike(content)) return;
		const preToken = tokens[i - 1];
		if (content === "[" && !nextToken?.markup?.includes("*") && !hasEscapedMarkup(token, "\\[") || content === "]" && !preToken?.markup?.includes("*") && !hasEscapedMarkup(token, "\\]")) {
			i++;
			return;
		}
		if (handleInlineCodeContent(rawContent, token)) return;
		if (handleInlineImageContent(content)) return;
		if ((tokens[i + 1]?.type !== "link_open" || isMarkdownLinkBeforeLinkifiedUrl(content)) && handleInlineLinkContent(content, token)) return;
		const reparsedNodes = tryReparseCollapsedInlineText(rawContent);
		if (reparsedNodes) {
			resetCurrentTextNode();
			for (const node of reparsedNodes) pushNode(node);
			i++;
			return;
		}
		if (handleEmphasisAndStrikethrough(content, token)) return;
		commitTextNode(content, token, preToken, nextToken);
		i++;
	}
	function handleLinkOpen(token) {
		if (recoverMarkdownImageFromLoadingImageTailLinkOpen(token)) return;
		if (shouldTreatLinkOpenAsTextInEscapedOuterImageTail()) {
			const { node: node$1, nextIndex: nextIndex$1 } = parseLinkToken(tokens, i, options);
			const text$1 = String(node$1.text || node$1.href || "");
			pushText(text$1, text$1);
			i = nextIndex$1;
			return;
		}
		resetCurrentTextNode();
		const { node, nextIndex } = parseLinkToken(tokens, i, options);
		i = nextIndex;
		const linkText = node.text || node.href || "";
		if (token.markup === "linkify" && !isDecodedFromRawPunycode(linkText, node.href, raw) && shouldDemoteFilenameLikeLinkify(linkText, internalOptions?.__linkifyDemotionContext)) {
			pushText(linkText, linkText);
			return;
		}
		const hasSingleTextChild = node.children.length === 1 && node.children[0]?.type === "text";
		if (node.loading && raw && node.text === node.href && hasSingleTextChild) {
			const recoveredLabel = recoverTrailingMarkdownLinkLabel(raw, node.href);
			if (recoveredLabel) {
				node.text = recoveredLabel;
				node.children = [{
					type: "text",
					content: recoveredLabel,
					raw: recoveredLabel
				}];
				node.raw = String(`[${recoveredLabel}](${node.href}${node.title ? ` "${node.title}"` : ""})`);
			}
		}
		if (options?.validateLink && !options.validateLink(node.href)) {
			pushText(node.text, node.text);
			return;
		}
		const hrefAttr = token.attrs?.find(([name]) => name === "href")?.[1];
		const hrefStr = String(hrefAttr ?? "");
		if (raw && hrefStr) {
			const openIdx = raw.indexOf("](");
			if (openIdx === -1) {} else {
				const closeIdx = raw.indexOf(")", openIdx + 2);
				if (closeIdx === -1) node.loading = true;
				else if (node.loading) {
					if (raw.slice(openIdx + 2, closeIdx).includes(hrefStr)) node.loading = false;
				}
			}
		}
		if (recoverMarkdownLinkFromTrailingText(node)) return;
		pushParsed(node);
	}
	function recoverMarkdownImageFromLoadingImageTailLinkOpen(token) {
		if (token.markup !== "linkify") return false;
		const { node, nextIndex } = parseLinkToken(tokens, i, options);
		if (!recoverMarkdownImageFromLoadingImageTailLink(node, nextIndex)) return false;
		i = nextIndex;
		return true;
	}
	function handleReference(token) {
		resetCurrentTextNode();
		pushNode(parseReferenceToken(token));
		i++;
	}
	function recoverMarkdownLinkFromTrailingText(token) {
		if (token.type !== "link") return false;
		const previous = result[result.length - 1];
		if (!previous || previous.type !== "text") return false;
		const match = String(previous.content ?? "").match(/^([^[]*)\[([^\]\n]+)\]\($/);
		if (!match) return false;
		const linkToken = token;
		const href = String(linkToken.href ?? "");
		const linkText = String(linkToken.text ?? "");
		const label = String(match[2] ?? "");
		const visibleHref = href.replace(/^(?:https?:\/\/|mailto:|ftp:\/\/)/i, "");
		if (!href || !(linkText === href || linkText === visibleHref || isLikelyUrl(linkText))) return false;
		const before = String(match[1] ?? "");
		if (before) {
			previous.content = before;
			previous.raw = before;
		} else result.pop();
		pushParsed({
			...token,
			text: label,
			children: [{
				type: "text",
				content: label,
				raw: label
			}],
			raw: String(`[${label}](${href}${linkToken.title ? ` "${linkToken.title}"` : ""})`)
		});
		return true;
	}
	function recoverMarkdownImageFromLoadingImageTail(token) {
		if (token.type !== "link") return false;
		const linkToken = token;
		const href = String(linkToken.href ?? "");
		if (!href) return false;
		return recoverMarkdownImageFromLoadingImageTailLink({
			href,
			title: linkToken.title == null || linkToken.title === "" ? null : String(linkToken.title),
			loading: Boolean(linkToken.loading)
		}, i + 1);
	}
	function recoverMarkdownImageFromLoadingImageTailLink(link$1, nextIndex) {
		const previous = result[result.length - 1];
		if (previous?.type !== "image" || previous.src || !previous.loading || !String(previous.raw ?? "").endsWith("](")) return false;
		const nextToken = tokens[nextIndex];
		const nextContent = String(nextToken?.content ?? "");
		if (nextToken?.type !== "text" || !nextContent.startsWith(")")) return false;
		result.pop();
		currentTextNode = null;
		const alt = String(previous.alt ?? "");
		pushParsed({
			type: "image",
			src: link$1.href,
			alt,
			title: link$1.title,
			raw: String(`![${alt}](${link$1.href}${link$1.title ? ` "${link$1.title}"` : ""})`),
			loading: Boolean(link$1.loading)
		});
		const trailing = nextContent.slice(1);
		const adjustedNext = cloneTokenWithMutableChildren(nextToken);
		adjustedNext.content = trailing;
		adjustedNext.raw = trailing;
		ensureWorkingTokens()[nextIndex] = adjustedNext;
		return true;
	}
	function recoverMarkdownImageFromTrailingBang(token) {
		if (token.type !== "link") return false;
		const previous = result[result.length - 1];
		const previousToken = tokens[i - 1];
		if (!previous || previous.type !== "text" || previousToken?.type !== "text") return false;
		const previousContent = String(previous.content ?? "");
		const previousTokenContent = String(previousToken.content ?? "");
		if (!previousContent.endsWith("!") || !previousTokenContent.endsWith("!")) return false;
		if (hasEscapedMarkup(previousToken, "\\!")) return false;
		const before = previousContent.slice(0, -1);
		if (before) {
			previous.content = before;
			previous.raw = before;
			currentTextNode = previous;
		} else {
			result.pop();
			currentTextNode = null;
		}
		const linkToken = token;
		const alt = String(linkToken.text ?? linkToken.children?.map((child) => String(child?.content ?? child?.raw ?? "")).join("") ?? "");
		const href = String(linkToken.href ?? "");
		const title = linkToken.title == null || linkToken.title === "" ? null : String(linkToken.title);
		pushParsed({
			type: "image",
			src: href,
			alt,
			title,
			raw: String(`![${alt}](${href}${title ? ` "${title}"` : ""})`),
			loading: Boolean(linkToken.loading)
		});
		return true;
	}
	function buildLoadingOuterImageLinkNode(imageNode, href = "", title = null) {
		const text$1 = String(imageNode.alt ?? imageNode.raw ?? "");
		return {
			type: "link",
			href,
			title,
			text: text$1,
			children: [imageNode],
			raw: String(`[${text$1}](${href}${title ? ` "${title}"` : ""})`),
			loading: true
		};
	}
	function buildLoadingImageNodeFromRaw(raw$1) {
		const normalizedRaw = raw$1.startsWith("![") ? raw$1 : `![${raw$1}`;
		const innerRaw = normalizedRaw.slice(2);
		const closeIdx = innerRaw.indexOf("](");
		return {
			type: "image",
			src: "",
			alt: closeIdx === -1 ? innerRaw.replace(/\]$/, "") : innerRaw.slice(0, closeIdx),
			title: null,
			raw: normalizedRaw,
			loading: true
		};
	}
	function recoverOuterImageLinkFromRawText(content) {
		const outerStart = content.indexOf("[![");
		if (outerStart === -1) return false;
		if (typeof raw === "string" && tokens.length === 1 && isEscapedVisibleChar(raw, outerStart, "[")) return false;
		const before = content.slice(0, outerStart);
		if (before) pushText(before, before);
		pushParsed(buildLoadingOuterImageLinkNode(buildLoadingImageNodeFromRaw(content.slice(outerStart + 1))));
		i++;
		return true;
	}
	function recoverOuterImageLinkStartFromImageToken(token) {
		if (options?.final) return false;
		const previousToken = tokens[i - 1];
		if (previousToken?.type !== "text") return false;
		if (!String(previousToken.content ?? "").endsWith("[")) return false;
		if (hasEscapedMarkup(previousToken, "\\[")) return false;
		const previous = result[result.length - 1];
		if (previous?.type === "text" && previous.content.endsWith("[")) {
			const before = previous.content.slice(0, -1);
			if (before) {
				previous.content = before;
				previous.raw = before;
				currentTextNode = previous;
			} else {
				result.pop();
				currentTextNode = null;
			}
		}
		pushParsed(buildLoadingOuterImageLinkNode(parseImageToken(token)));
		i++;
		return true;
	}
	function recoverOuterImageLinkFromSyntheticLinkToken(token) {
		if (token.type !== "link") return false;
		const linkToken = token;
		const raw$1 = String(linkToken.raw ?? "");
		const text$1 = String(linkToken.text ?? "");
		if (!raw$1.startsWith("[![") && !text$1.startsWith("![")) return false;
		const imageTitle = linkToken.title == null || linkToken.title === "" ? null : String(linkToken.title);
		pushParsed(buildLoadingOuterImageLinkNode({
			type: "image",
			src: String(linkToken.href ?? ""),
			alt: text$1.replace(/^!\[/, "").replace(/\]$/, ""),
			title: imageTitle,
			raw: raw$1.startsWith("[![") ? raw$1.slice(1) : raw$1,
			loading: true
		}));
		return true;
	}
	function recoverOuterImageLinkMidStateFromText(content) {
		if (!content.startsWith("](")) return false;
		const outerOpenToken = tokens[i - 2];
		if (outerOpenToken?.type === "text" && String(outerOpenToken.content ?? "").endsWith("[") && hasEscapedMarkup(outerOpenToken, "\\[")) return false;
		const previous = result[result.length - 1];
		if (previous?.type !== "image" && previous?.type !== "link") return false;
		const previousWithChildren = previous;
		const previousLink = previous?.type === "link" && Array.isArray(previousWithChildren.children) && previousWithChildren.children.length === 1 && previousWithChildren.children[0]?.type === "image" ? result.pop() : null;
		const imageNode = previousLink ? previousLink.children[0] : result.pop();
		if (!imageNode || imageNode.type !== "image") return false;
		const nextToken = tokens[i + 1];
		let href = String(previousLink?.href ?? "");
		let title = previousLink?.title == null ? null : String(previousLink.title);
		let loading = true;
		if (nextToken?.type === "link_open") {
			const { node, nextIndex } = parseLinkToken(tokens, i + 1, options);
			href = node.href;
			title = node.title;
			loading = true;
			i = nextIndex;
		} else {
			href = content.slice(2);
			if (href.includes("\"")) {
				const parts = href.split("\"");
				href = String(parts[0] ?? "").trim();
				title = parts[1] == null ? null : String(parts[1]).trim();
			}
			i++;
		}
		const linkNode = buildLoadingOuterImageLinkNode(imageNode, href, title);
		linkNode.loading = loading;
		pushParsed(linkNode);
		return true;
	}
	function shouldTreatLinkOpenAsTextInEscapedOuterImageTail() {
		const outerOpenToken = tokens[i - 3];
		return tokens[i - 2]?.type === "image" && tokens[i - 1]?.type === "text" && String(tokens[i - 1].content ?? "") === "](" && outerOpenToken?.type === "text" && String(outerOpenToken.content ?? "").endsWith("[") && hasEscapedMarkup(outerOpenToken, "\\[");
	}
	function handleInlineLinkContent(content, _token) {
		const linkStart = content.indexOf("[");
		if (linkStart === -1) return false;
		let textNodeContent = content.slice(0, linkStart);
		const linkEnd = content.indexOf("](", linkStart);
		if (linkEnd !== -1) {
			const textToken$1 = tokens[i + 2];
			let text$1 = content.slice(linkStart + 1, linkEnd);
			if (text$1.includes("[")) {
				const secondLinkStart = text$1.indexOf("[");
				textNodeContent += content.slice(0, linkStart + secondLinkStart + 1);
				const newLinkStart = linkStart + secondLinkStart + 1;
				text$1 = content.slice(newLinkStart + 1, linkEnd);
			}
			const nextToken = tokens[i + 1];
			if (content.endsWith("](") && nextToken?.type === "link_open" && textToken$1) {
				const last = tokens[i + 4];
				let index = 4;
				let loading$1 = true;
				if (last?.type === "text") {
					const lastContent = String(last.content ?? "");
					if (lastContent.startsWith(")")) {
						loading$1 = false;
						const trailingAfterClose = lastContent.slice(1);
						if (trailingAfterClose) {
							const trailingToken = cloneTokenWithMutableChildren(last);
							trailingToken.content = trailingAfterClose;
							trailingToken.raw = trailingAfterClose;
							ensureWorkingTokens()[i + 4] = trailingToken;
						} else index++;
					} else if (lastContent === ".") index++;
				}
				pushInlineTextContent(textNodeContent, _token);
				const hrefFromToken = String(textToken$1.content ?? "");
				if (options?.validateLink && !options.validateLink(hrefFromToken)) pushText(text$1, text$1);
				else pushParsed({
					type: "link",
					href: hrefFromToken,
					title: null,
					text: text$1,
					children: [{
						type: "text",
						content: text$1,
						raw: text$1
					}],
					loading: loading$1
				});
				i += index;
				return true;
			}
			const linkContentEnd = content.indexOf(")", linkEnd);
			const href = linkContentEnd !== -1 ? content.slice(linkEnd + 2, linkContentEnd) : "";
			const loading = linkContentEnd === -1;
			let emphasisMatch = textNodeContent.match(/\*+$/);
			if (emphasisMatch) textNodeContent = textNodeContent.replace(/\*+$/, "");
			pushInlineTextContent(textNodeContent, _token);
			if (!emphasisMatch) emphasisMatch = text$1.match(/^\*+/);
			if (!requireClosingStrong && emphasisMatch) {
				const type = emphasisMatch[0].length;
				text$1 = text$1.replace(/^\*+/, "").replace(/\*+$/, "");
				const newTokens = [];
				if (type === 1) newTokens.push({
					type: "em_open",
					tag: "em",
					nesting: 1
				});
				else if (type === 2) newTokens.push({
					type: "strong_open",
					tag: "strong",
					nesting: 1
				});
				else if (type === 3) {
					newTokens.push({
						type: "strong_open",
						tag: "strong",
						nesting: 1
					});
					newTokens.push({
						type: "em_open",
						tag: "em",
						nesting: 1
					});
				}
				newTokens.push({
					type: "link",
					href,
					title: null,
					text: text$1,
					children: [{
						type: "text",
						content: text$1,
						raw: text$1
					}],
					loading
				});
				if (type === 1) {
					newTokens.push({
						type: "em_close",
						tag: "em",
						nesting: -1
					});
					const { node } = parseEmphasisToken(newTokens, 0, options);
					pushNode(node);
				} else if (type === 2) {
					newTokens.push({
						type: "strong_close",
						tag: "strong",
						nesting: -1
					});
					const { node } = parseStrongToken(newTokens, 0, void 0, options);
					pushNode(node);
				} else if (type === 3) {
					newTokens.push({
						type: "em_close",
						tag: "em",
						nesting: -1
					});
					newTokens.push({
						type: "strong_close",
						tag: "strong",
						nesting: -1
					});
					const { node } = parseStrongToken(newTokens, 0, void 0, options);
					pushNode(node);
				} else {
					const { node } = parseEmphasisToken(newTokens, 0, options);
					pushNode(node);
				}
			} else if (options?.validateLink && !options.validateLink(href)) pushText(text$1, text$1);
			else pushParsed({
				type: "link",
				href,
				title: null,
				text: text$1,
				children: [{
					type: "text",
					content: text$1,
					raw: text$1
				}],
				loading
			});
			const afterText = linkContentEnd !== -1 ? content.slice(linkContentEnd + 1) : "";
			if (afterText) {
				handleToken({
					type: "text",
					content: afterText,
					raw: afterText
				});
				i--;
			}
			i++;
			return true;
		}
		return false;
	}
	function handleInlineImageContent(content) {
		const imageStart = content.indexOf("![");
		if (imageStart === -1) return false;
		const textNodeContent = content.slice(0, imageStart);
		if (textNodeContent && !currentTextNode) currentTextNode = {
			type: "text",
			content: textNodeContent,
			raw: textNodeContent
		};
		else if (textNodeContent && currentTextNode) currentTextNode.content += textNodeContent;
		if (currentTextNode) {
			result.push(currentTextNode);
			currentTextNode = null;
		}
		pushParsed(buildLoadingImageNodeFromRaw(content.slice(imageStart)));
		i++;
		return true;
	}
	function handleCheckboxLike(content) {
		if (!(content?.startsWith("[") && pPreToken?.type === "list_item_open")) return false;
		const w = content.slice(1).match(/[^\s\]]/);
		if (w === null) {
			i++;
			return true;
		}
		if (w && /x/i.test(w[0])) {
			const checked = w[0] === "x" || w[0] === "X";
			pushParsed({
				type: "checkbox_input",
				checked,
				raw: checked ? "[x]" : "[ ]"
			});
			i++;
			return true;
		}
		return false;
	}
	return result;
}

//#endregion
//#region src/parser/node-parsers/list-parser.ts
function trimInlineTokenTail(token) {
	const rawContent = String(token.content ?? "");
	const trimmed = rawContent.replace(/[ \t\r\n]+$/g, "");
	if (trimmed === rawContent) return;
	token.content = trimmed;
	const children = token.children;
	if (!Array.isArray(children) || children.length === 0) return;
	while (children.length) {
		const last = children[children.length - 1];
		if (!last) {
			children.pop();
			continue;
		}
		if (last.type === "softbreak" || last.type === "hardbreak") {
			children.pop();
			continue;
		}
		if (last.type === "text") {
			const lastContent = String(last.content ?? "");
			const next = lastContent.replace(/[ \t\r\n]+$/g, "");
			if (next === lastContent) break;
			if (next) {
				last.content = next;
				break;
			}
			children.pop();
			continue;
		}
		break;
	}
}
function stripLeakedOrderedListMarkerSuffix(token) {
	const rawContent = String(token.content ?? "");
	const leak = rawContent.match(/\r?\n\s*\d+[.)]?\s*$/);
	if (!leak || typeof leak.index !== "number") return;
	token.content = rawContent.slice(0, leak.index);
	const children = token.children;
	if (!Array.isArray(children) || children.length === 0) return;
	while (children.length) {
		const last = children[children.length - 1];
		if (!last) {
			children.pop();
			continue;
		}
		if (last.type === "softbreak" || last.type === "hardbreak") {
			children.pop();
			continue;
		}
		if (last.type === "text") {
			const lastContent = String(last.content ?? "");
			if (/^[ \t\r\n\d.)]*$/.test(lastContent)) {
				children.pop();
				continue;
			}
			const next = lastContent.replace(/[ \t\r\n\d.)]+$/g, "");
			if (next !== lastContent) if (next) last.content = next;
			else children.pop();
		}
		break;
	}
}
function needsListParagraphTokenPatch(token) {
	const rawContent = String(token.content ?? "");
	return /[ \t\r\n]+$/.test(rawContent) || /\r?\n\s*\d+[.)]?\s*$/.test(rawContent);
}
function parseList(tokens, index, options) {
	const token = tokens[index];
	const listItems = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	while (j < tokens.length && tokens[j].type !== "bullet_list_close" && tokens[j].type !== "ordered_list_close") if (tokens[j].type === "list_item_open") {
		const itemChildren = [];
		let k = j + 1;
		while (k < tokens.length && tokens[k].type !== "list_item_close") if (tokens[k].type === "paragraph_open") {
			const originalContentToken = tokens[k + 1];
			const contentToken = needsListParagraphTokenPatch(originalContentToken) ? cloneTokenWithMutableChildren(originalContentToken) : originalContentToken;
			const preToken = tokens[k - 1];
			if (contentToken !== originalContentToken) {
				stripLeakedOrderedListMarkerSuffix(contentToken);
				trimInlineTokenTail(contentToken);
			}
			const paragraphRaw = String(contentToken.content ?? "");
			itemChildren.push({
				type: "paragraph",
				children: parseInlineTokens(contentToken.children || [], paragraphRaw, preToken, linkifyContext.options()),
				raw: paragraphRaw
			});
			linkifyContext.remember(paragraphRaw);
			k += 3;
		} else if (tokens[k].type === "blockquote_open") {
			const [blockquoteNode, newIndex] = parseBlockquote(tokens, k, linkifyContext.options());
			itemChildren.push(blockquoteNode);
			linkifyContext.remember(blockquoteNode.raw);
			k = newIndex;
		} else if (tokens[k].type === "bullet_list_open" || tokens[k].type === "ordered_list_open") {
			const [nestedListNode, newIndex] = parseList(tokens, k, linkifyContext.options());
			itemChildren.push(nestedListNode);
			linkifyContext.remember(nestedListNode.raw);
			k = newIndex;
		} else {
			const handled = parseCommonBlockToken(tokens, k, linkifyContext.options(), containerTokenHandlers);
			if (handled) {
				itemChildren.push(handled[0]);
				linkifyContext.remember(handled[0].raw);
				k = handled[1];
			} else k += 1;
		}
		listItems.push({
			type: "list_item",
			children: itemChildren,
			raw: itemChildren.map((child) => child.raw).join("")
		});
		j = k + 1;
	} else j += 1;
	return [{
		type: "list",
		ordered: token.type === "ordered_list_open",
		start: (() => {
			if (token.attrs && token.attrs.length) {
				const found = token.attrs.find((a) => a[0] === "start");
				if (found) {
					const parsed = Number(found[1]);
					return Number.isFinite(parsed) && parsed !== 0 ? parsed : 1;
				}
			}
		})(),
		items: listItems,
		raw: listItems.map((item) => item.raw).join("\n")
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/admonition-parser.ts
function parseAdmonition(tokens, index, match, options) {
	const kind = String(match[1] ?? "note");
	const title = String(match[2] ?? kind.charAt(0).toUpperCase() + kind.slice(1));
	const admonitionChildren = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	while (j < tokens.length && tokens[j].type !== "container_close") if (tokens[j].type === "paragraph_open") {
		const contentToken = tokens[j + 1];
		if (contentToken) {
			const paragraphNode = {
				type: "paragraph",
				children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ""), void 0, linkifyContext.options()),
				raw: String(contentToken.content ?? "")
			};
			admonitionChildren.push(paragraphNode);
			linkifyContext.remember(paragraphNode.raw);
		}
		j += 3;
	} else if (tokens[j].type === "bullet_list_open" || tokens[j].type === "ordered_list_open") {
		const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options());
		admonitionChildren.push(listNode);
		linkifyContext.remember(listNode.raw);
		j = newIndex;
	} else if (tokens[j].type === "blockquote_open") {
		const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, linkifyContext.options());
		admonitionChildren.push(blockquoteNode);
		linkifyContext.remember(blockquoteNode.raw);
		j = newIndex;
	} else {
		const handled = parseBasicBlockToken(tokens, j, linkifyContext.options());
		if (handled) {
			admonitionChildren.push(handled[0]);
			linkifyContext.remember(handled[0].raw);
			j = handled[1];
		} else j++;
	}
	return [{
		type: "admonition",
		kind,
		title,
		children: admonitionChildren,
		raw: `:::${kind} ${title}\n${admonitionChildren.map((child) => child.raw).join("\n")}\n:::`
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/container-parser.ts
const CONTAINER_KINDS = new Set([
	"warning",
	"info",
	"note",
	"tip",
	"danger",
	"caution"
]);
function parseContainerInfo(info) {
	let markerEnd = 0;
	while (markerEnd < info.length && markerEnd < 3 && info[markerEnd] === ":") markerEnd++;
	if (markerEnd === 0 || info[markerEnd] === ":") return null;
	const rest = info.slice(markerEnd).trimStart();
	if (!rest) return null;
	const firstWhitespace = rest.search(/\s/);
	const rawKind = (firstWhitespace === -1 ? rest : rest.slice(0, firstWhitespace)).toLowerCase();
	if (!CONTAINER_KINDS.has(rawKind)) return null;
	return {
		kind: rawKind,
		title: firstWhitespace === -1 ? "" : rest.slice(firstWhitespace).trim()
	};
}
function parseContainer(tokens, index, options) {
	const openToken = tokens[index];
	let kind = "note";
	let title = "";
	const typeMatch = openToken.type.match(/^container_(\w+)_open$/);
	if (typeMatch) {
		kind = typeMatch[1];
		const info = String(openToken.info ?? "").trim();
		if (info && !info.startsWith(":::")) {
			if (info.toLowerCase().startsWith(kind)) {
				const maybe = info.slice(kind.length).trim();
				if (maybe) title = maybe;
			}
		}
	} else {
		const parsedInfo = parseContainerInfo(String(openToken.info ?? "").trim());
		if (parsedInfo) {
			kind = parsedInfo.kind;
			title = parsedInfo.title;
		}
	}
	if (!title) title = kind.charAt(0).toUpperCase() + kind.slice(1);
	const children = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	const closeType = /* @__PURE__ */ new RegExp(`^container_${kind}_close$`);
	while (j < tokens.length && tokens[j].type !== "container_close" && !closeType.test(tokens[j].type)) if (tokens[j].type === "paragraph_open") {
		const contentToken = tokens[j + 1];
		if (contentToken) {
			const childrenArr = contentToken.children || [];
			let i = -1;
			for (let k = childrenArr.length - 1; k >= 0; k--) {
				const t = childrenArr[k];
				if (t.type === "text" && /:+/.test(t.content)) {
					i = k;
					break;
				}
			}
			const paragraphNode = {
				type: "paragraph",
				children: parseInlineTokens((i !== -1 ? childrenArr.slice(0, i) : childrenArr) || [], void 0, void 0, linkifyContext.options()),
				raw: String(contentToken.content ?? "").replace(/\n:+$/, "").replace(/\n\s*:::\s*$/, "")
			};
			children.push(paragraphNode);
			linkifyContext.remember(paragraphNode.raw);
		}
		j += 3;
	} else if (tokens[j].type === "bullet_list_open" || tokens[j].type === "ordered_list_open") {
		const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options());
		children.push(listNode);
		linkifyContext.remember(listNode.raw);
		j = newIndex;
	} else if (tokens[j].type === "blockquote_open") {
		const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, linkifyContext.options());
		children.push(blockquoteNode);
		linkifyContext.remember(blockquoteNode.raw);
		j = newIndex;
	} else {
		const handled = parseBasicBlockToken(tokens, j, linkifyContext.options());
		if (handled) {
			children.push(handled[0]);
			linkifyContext.remember(handled[0].raw);
			j = handled[1];
		} else j++;
	}
	return [{
		type: "admonition",
		kind,
		title,
		children,
		raw: `:::${kind} ${title}\n${children.map((c) => c.raw).join("\n")}\n:::`
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/container-token-handlers.ts
const CONTAINER_REGEX = /^::: ?(warning|info|note|tip|danger|caution|error) ?(.*)$/;
function handleContainerOpen(tokens, index, options) {
	const token = tokens[index];
	if (token.type !== "container_open") return null;
	const match = CONTAINER_REGEX.exec(String(token.info ?? ""));
	if (!match) return null;
	return parseAdmonition(tokens, index, match, options);
}
const containerTokenHandlers = {
	parseContainer: (tokens, index, options) => parseContainer(tokens, index, options),
	matchAdmonition: handleContainerOpen
};

//#endregion
//#region src/parser/node-parsers/blockquote-parser.ts
function parseBlockquote(tokens, index, options) {
	const blockquoteChildren = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	while (j < tokens.length && tokens[j].type !== "blockquote_close") switch (tokens[j].type) {
		case "paragraph_open": {
			const contentToken = tokens[j + 1];
			const paragraphNode = {
				type: "paragraph",
				children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ""), void 0, linkifyContext.options()),
				raw: String(contentToken.content ?? "")
			};
			blockquoteChildren.push(paragraphNode);
			linkifyContext.remember(paragraphNode.raw);
			j += 3;
			break;
		}
		case "bullet_list_open":
		case "ordered_list_open": {
			const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options());
			blockquoteChildren.push(listNode);
			linkifyContext.remember(listNode.raw);
			j = newIndex;
			break;
		}
		case "blockquote_open": {
			const [nestedBlockquote, newIndex] = parseBlockquote(tokens, j, linkifyContext.options());
			blockquoteChildren.push(nestedBlockquote);
			linkifyContext.remember(nestedBlockquote.raw);
			j = newIndex;
			break;
		}
		default: {
			const handled = parseCommonBlockToken(tokens, j, linkifyContext.options(), containerTokenHandlers);
			if (handled) {
				blockquoteChildren.push(handled[0]);
				linkifyContext.remember(handled[0].raw);
				j = handled[1];
			} else j++;
			break;
		}
	}
	return [{
		type: "blockquote",
		children: blockquoteChildren,
		raw: blockquoteChildren.map((child) => child.raw).join("\n")
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/code-block-parser.ts
function parseCodeBlock(token) {
	if (token.info?.startsWith("diff")) return parseFenceToken(token);
	const contentStr = String(token.content ?? "");
	const match = contentStr.match(/ type="application\/vnd\.ant\.([^"]+)"/);
	let code$1 = contentStr;
	if (match?.[1]) code$1 = contentStr.replace(/<antArtifact[^>]*>/g, "").replace(/<\/antArtifact>/g, "");
	const hasMap = Array.isArray(token.map) && token.map.length === 2;
	return {
		type: "code_block",
		language: match ? match[1] : String(token.info ?? ""),
		code: code$1,
		raw: code$1,
		loading: !hasMap
	};
}

//#endregion
//#region src/parser/node-parsers/definition-list-parser.ts
function parseDefinitionList(tokens, index, options) {
	const items = [];
	let j = index + 1;
	let termNodes = [];
	let definitionNodes = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	while (j < tokens.length && tokens[j].type !== "dl_close") if (tokens[j].type === "dt_open") {
		const termToken = tokens[j + 1];
		termNodes = parseInlineTokens(termToken.children || [], void 0, void 0, linkifyContext.options());
		linkifyContext.remember(termNodes.map((term) => term.raw).join(""));
		j += 3;
	} else if (tokens[j].type === "dd_open") {
		let k = j + 1;
		definitionNodes = [];
		while (k < tokens.length && tokens[k].type !== "dd_close") if (tokens[k].type === "paragraph_open") {
			const contentToken = tokens[k + 1];
			definitionNodes.push({
				type: "paragraph",
				children: parseInlineTokens(contentToken.children || [], String(contentToken.content ?? ""), void 0, linkifyContext.options()),
				raw: String(contentToken.content ?? "")
			});
			linkifyContext.remember(String(contentToken.content ?? ""));
			k += 3;
		} else k++;
		if (termNodes.length > 0) {
			items.push({
				type: "definition_item",
				term: termNodes,
				definition: definitionNodes,
				raw: `${termNodes.map((term) => term.raw).join("")}: ${definitionNodes.map((def) => def.raw).join("\n")}`
			});
			termNodes = [];
		}
		j = k + 1;
	} else j++;
	return [{
		type: "definition_list",
		items,
		raw: items.map((item) => item.raw).join("\n")
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/footnote-parser.ts
function parseFootnote(tokens, index, options) {
	const meta = tokens[index].meta ?? {};
	const id = String(meta?.label ?? "0");
	const footnoteChildren = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	while (j < tokens.length && tokens[j].type !== "footnote_close") if (tokens[j].type === "paragraph_open") {
		const contentToken = tokens[j + 1];
		const children = contentToken.children ? [...contentToken.children] : [];
		if (tokens[j + 2].type === "footnote_anchor") children.push(tokens[j + 2]);
		const paragraphNode = {
			type: "paragraph",
			children: parseInlineTokens(children, String(contentToken.content ?? ""), void 0, linkifyContext.options()),
			raw: String(contentToken.content ?? "")
		};
		footnoteChildren.push(paragraphNode);
		linkifyContext.remember(paragraphNode.raw);
		j += 3;
	} else j++;
	return [{
		type: "footnote",
		id,
		children: footnoteChildren,
		raw: `[^${id}]: ${footnoteChildren.map((child) => child.raw).join("\n")}`
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/heading-parser.ts
function parseHeading(tokens, index, options) {
	const token = tokens[index];
	const attrs = token.attrs;
	const attrsRecord = Array.isArray(attrs) && attrs.length ? Object.fromEntries(attrs.filter((pair) => Array.isArray(pair) && pair.length >= 1 && pair[0]).map(([name, value]) => [String(name), value == null || value === "" ? true : String(value)])) : void 0;
	const levelStr = String(token.tag?.substring(1) ?? "1");
	const headingLevel = Number.parseInt(levelStr, 10);
	const headingContentToken = tokens[index + 1];
	const headingContent = String(headingContentToken.content ?? "");
	return {
		type: "heading",
		level: headingLevel,
		text: headingContent,
		...attrsRecord ? { attrs: attrsRecord } : {},
		children: parseInlineTokens(headingContentToken.children || [], headingContent, void 0, options),
		raw: headingContent
	};
}

//#endregion
//#region src/parser/node-parsers/html-block-parser.ts
function findMatchingCloseTagEnd(rawHtml, tag, startIndex) {
	const lowerTag = tag.toLowerCase();
	const openTagRe = new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, "i");
	const closeTagRe = new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, "i");
	let depth = 0;
	let index = Math.max(0, startIndex);
	while (index < rawHtml.length) {
		const lt = rawHtml.indexOf("<", index);
		if (lt === -1) return -1;
		const slice = rawHtml.slice(lt);
		if (closeTagRe.test(slice)) {
			const endRel = findTagCloseIndexOutsideQuotes(slice);
			if (endRel === -1) return -1;
			if (depth === 0) return lt + endRel + 1;
			depth--;
			index = lt + endRel + 1;
			continue;
		}
		if (openTagRe.test(slice)) {
			const endRel = findTagCloseIndexOutsideQuotes(slice);
			if (endRel === -1) return -1;
			const rawTag = slice.slice(0, endRel + 1);
			if (!/\/\s*>$/.test(rawTag)) depth++;
			index = lt + endRel + 1;
			continue;
		}
		index = lt + 1;
	}
	return -1;
}
function parseHtmlBlock(token) {
	const raw = String(token.content ?? "");
	if (/^\s*<!--/.test(raw) || /^\s*<!/.test(raw) || /^\s*<\?/.test(raw)) return {
		type: "html_block",
		content: raw,
		raw,
		tag: "",
		loading: false
	};
	const tag = (raw.match(/^\s*<([A-Z][\w:-]*)/i)?.[1] || "").toLowerCase();
	if (!tag) return {
		type: "html_block",
		content: raw,
		raw,
		tag: "",
		loading: false
	};
	const openEnd = findTagCloseIndexOutsideQuotes(raw);
	const openTag = openEnd === -1 ? raw : raw.slice(0, openEnd + 1);
	const selfClosing = openEnd !== -1 && /\/\s*>$/.test(openTag);
	const isVoid = VOID_HTML_TAGS.has(tag);
	const attrs = parseTagAttrs(openTag);
	const hasClosing = (openEnd === -1 ? -1 : findMatchingCloseTagEnd(raw, tag, openEnd + 1)) !== -1;
	const loading = !(isVoid || selfClosing || hasClosing);
	return {
		type: "html_block",
		content: loading ? `${raw.replace(/<[^>]*$/, "")}\n</${tag}>` : raw,
		raw,
		tag,
		attrs: attrs.length ? attrs : void 0,
		loading
	};
}

//#endregion
//#region src/parser/node-parsers/math-block-parser.ts
function parseMathBlock(token) {
	const content = String(token.content ?? "");
	const raw = token.raw === "$$" ? `$$${content}$$` : String(token.raw ?? "");
	return {
		type: "math_block",
		content,
		loading: !!token.loading,
		raw,
		markup: token.markup
	};
}

//#endregion
//#region src/parser/node-parsers/table-parser.ts
function extractAlign(attrs) {
	if (!attrs) return "left";
	for (const a of attrs) {
		if (!a) continue;
		const [key, val] = a;
		if (!val) continue;
		const value = String(val).trim().toLowerCase();
		if (key === "style") {
			const m = /text-align\s*:\s*(left|right|center)/i.exec(value);
			if (m) return m[1].toLowerCase();
		}
	}
	return "left";
}
function hasTableCellContext(context) {
	return context?.filename === true || context?.explicitFilename === true || context?.marketTicker === true;
}
function mergeTableCellContext(left, right) {
	const merged = {
		filename: left?.filename || right?.filename,
		explicitFilename: left?.explicitFilename || right?.explicitFilename,
		marketTicker: left?.marketTicker || right?.marketTicker
	};
	return hasTableCellContext(merged) ? merged : void 0;
}
function parseOptionsForTableCell(options, headerRaw, rowContext) {
	const cellContext = mergeTableCellContext(inferLinkifyDemotionContext(headerRaw), rowContext);
	if (!hasTableCellContext(cellContext)) return options;
	const inheritedContext = options?.__linkifyDemotionContext;
	return {
		...options,
		__linkifyDemotionContext: {
			filename: inheritedContext?.filename || cellContext?.filename,
			explicitFilename: inheritedContext?.explicitFilename || cellContext?.explicitFilename,
			marketTicker: inheritedContext?.marketTicker || cellContext?.marketTicker
		}
	};
}
function parseTable(tokens, index, options) {
	let j = index + 1;
	let headerRow = null;
	const rows = [];
	let isHeader = false;
	while (j < tokens.length && tokens[j].type !== "table_close") if (tokens[j].type === "thead_open") {
		isHeader = true;
		j++;
	} else if (tokens[j].type === "thead_close") {
		isHeader = false;
		j++;
	} else if (tokens[j].type === "tbody_open" || tokens[j].type === "tbody_close") j++;
	else if (tokens[j].type === "tr_open") {
		const cells = [];
		let k = j + 1;
		let rowContext;
		while (k < tokens.length && tokens[k].type !== "tr_close") if (tokens[k].type === "th_open" || tokens[k].type === "td_open") {
			const isHeaderCell = tokens[k].type === "th_open";
			const contentToken = tokens[k + 1];
			const content = String(contentToken.content ?? "");
			const align = extractAlign(tokens[k].attrs);
			const cellIndex = cells.length;
			const isBodyCell = !isHeaderCell && !isHeader;
			const headerRaw = isBodyCell ? headerRow?.cells[cellIndex]?.raw : void 0;
			cells.push({
				type: "table_cell",
				header: isHeaderCell || isHeader,
				children: parseInlineTokens(contentToken.children || [], content, void 0, parseOptionsForTableCell(options, headerRaw, isBodyCell ? rowContext : void 0)),
				raw: content,
				align
			});
			if (isBodyCell) rowContext = mergeTableCellContext(rowContext, inferLinkifyDemotionContext(content));
			k += 3;
		} else k++;
		const rowNode = {
			type: "table_row",
			cells,
			raw: cells.map((cell) => cell.raw).join("|")
		};
		if (isHeader) headerRow = rowNode;
		else rows.push(rowNode);
		j = k + 1;
	} else j++;
	if (!headerRow) headerRow = {
		type: "table_row",
		cells: [],
		raw: ""
	};
	const tokenLoading = tokens[index].loading === true;
	return [{
		type: "table",
		header: headerRow,
		rows,
		loading: tokenLoading && !options?.final && rows.length === 0,
		raw: [headerRow, ...rows].map((row) => row.raw).join("\n")
	}, j + 1];
}

//#endregion
//#region src/parser/node-parsers/thematic-break-parser.ts
function parseThematicBreak() {
	return {
		type: "thematic_break",
		raw: "---"
	};
}

//#endregion
//#region src/parser/node-parsers/block-token-parser.ts
let emptyHtmlTagSets = null;
const HTML_TAG_SET_CACHE = /* @__PURE__ */ new WeakMap();
function getEmptyHtmlTagSets() {
	if (!emptyHtmlTagSets) emptyHtmlTagSets = {
		allowedTagSet: buildAllowedHtmlTagSet(),
		customTagSet: null
	};
	return emptyHtmlTagSets;
}
function getHtmlTagSets(customTags) {
	if (!customTags || customTags.length === 0) return getEmptyHtmlTagSets();
	const cached = HTML_TAG_SET_CACHE.get(customTags);
	if (cached) return cached;
	const normalized = customTags.map(normalizeCustomHtmlTagName).filter(Boolean);
	if (!normalized.length) {
		const entry$1 = getEmptyHtmlTagSets();
		HTML_TAG_SET_CACHE.set(customTags, entry$1);
		return entry$1;
	}
	const entry = {
		allowedTagSet: buildAllowedHtmlTagSet({ customHtmlTags: customTags }),
		customTagSet: new Set(normalized)
	};
	HTML_TAG_SET_CACHE.set(customTags, entry);
	return entry;
}
function parseVmrContainer(tokens, index, options) {
	const openToken = tokens[index];
	const attrs = openToken.attrs;
	let name = "";
	const containerAttrs = {};
	if (attrs) {
		for (const [key, value] of attrs) if (key === "class") {
			const match = value.match(/(?:\s|^)vmr-container-(\S+)/);
			if (match) name = match[1];
		} else if (key.startsWith("data-")) {
			const attrName = key.slice(5);
			try {
				containerAttrs[attrName] = JSON.parse(value);
			} catch {
				containerAttrs[attrName] = value;
			}
		}
	}
	const children = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options, true);
	let j = index + 1;
	while (j < tokens.length && tokens[j].type !== "vmr_container_close") if (tokens[j].type === "paragraph_open") {
		const contentToken = tokens[j + 1];
		if (contentToken) {
			const paragraphNode = {
				type: "paragraph",
				children: parseInlineTokens(contentToken.children || [], void 0, void 0, linkifyContext.options()),
				raw: String(contentToken.content ?? "")
			};
			children.push(paragraphNode);
			linkifyContext.remember(paragraphNode.raw);
		}
		j += 3;
	} else if (tokens[j].type === "bullet_list_open" || tokens[j].type === "ordered_list_open") {
		const [listNode, newIndex] = parseList(tokens, j, linkifyContext.options());
		children.push(listNode);
		linkifyContext.remember(listNode.raw);
		j = newIndex;
	} else if (tokens[j].type === "blockquote_open") {
		const [blockquoteNode, newIndex] = parseBlockquote(tokens, j, linkifyContext.options());
		children.push(blockquoteNode);
		linkifyContext.remember(blockquoteNode.raw);
		j = newIndex;
	} else {
		const handled = parseBasicBlockToken(tokens, j, linkifyContext.options());
		if (handled) {
			children.push(handled[0]);
			linkifyContext.remember(handled[0].raw);
			j = handled[1];
		} else j++;
	}
	const hasCloseToken = j < tokens.length && tokens[j].type === "vmr_container_close";
	const closed = hasCloseToken || !!options?.final;
	let raw = `::: ${name}`;
	if (Object.keys(containerAttrs).length > 0) raw += ` ${JSON.stringify(containerAttrs)}`;
	raw += "\n";
	if (children.length > 0) {
		raw += openToken.raw ?? children.map((c) => c.raw).join("\n");
		raw += "\n";
	}
	raw += ":::";
	return [{
		type: "vmr_container",
		name,
		loading: !closed,
		attrs: Object.keys(containerAttrs).length > 0 ? containerAttrs : void 0,
		children,
		raw
	}, hasCloseToken ? j + 1 : j];
}
function stripWrapperNewlines(s) {
	return s.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
}
function stripTrailingPartialClosingTag(inner, tag) {
	if (!inner || !tag) return inner;
	const re = new RegExp(String.raw`[\t ]*<\s*\/\s*${tag}[^>]*$`, "i");
	return inner.replace(re, "");
}
function findMatchingCloseTagRange(rawHtml, tag, startIndex) {
	if (!rawHtml || !tag) return null;
	const lowerTag = tag.toLowerCase();
	const openTagRe = new RegExp(String.raw`^<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, "i");
	const closeTagRe = new RegExp(String.raw`^<\s*\/\s*${escapeTagForRegExp(lowerTag)}(?=\s|>)`, "i");
	let depth = 0;
	let index = Math.max(0, startIndex);
	while (index < rawHtml.length) {
		const lt = rawHtml.indexOf("<", index);
		if (lt === -1) break;
		const slice = rawHtml.slice(lt);
		if (closeTagRe.test(slice)) {
			const endRel = findTagCloseIndexOutsideQuotes(slice);
			if (endRel === -1) return null;
			if (depth === 0) return {
				start: lt,
				end: lt + endRel + 1
			};
			depth--;
			index = lt + endRel + 1;
			continue;
		}
		if (openTagRe.test(slice)) {
			const endRel = findTagCloseIndexOutsideQuotes(slice);
			if (endRel === -1) return null;
			const raw = slice.slice(0, endRel + 1);
			if (!/\/\s*>$/.test(raw)) depth++;
			index = lt + endRel + 1;
			continue;
		}
		index = lt + 1;
	}
	return null;
}
function findNextCustomHtmlBlockFromSource(source, tag, startIndex) {
	if (!source || !tag) return null;
	const lowerTag = tag.toLowerCase();
	const openRe = new RegExp(String.raw`<\s*${lowerTag}(?=\s|>|/)`, "gi");
	openRe.lastIndex = Math.max(0, startIndex || 0);
	const openMatch = openRe.exec(source);
	if (!openMatch || openMatch.index == null) return null;
	const openStart = openMatch.index;
	const openSlice = source.slice(openStart);
	const openEndRel = findTagCloseIndexOutsideQuotes(openSlice);
	if (openEndRel === -1) return null;
	const openEnd = openStart + openEndRel;
	if (/\/\s*>\s*$/.test(openSlice.slice(0, openEndRel + 1))) {
		const end = openEnd + 1;
		return {
			raw: source.slice(openStart, end),
			end
		};
	}
	let depth = 1;
	let i = openEnd + 1;
	const isOpenAt = (pos) => {
		const s = source.slice(pos);
		return new RegExp(String.raw`^<\s*${lowerTag}(?=\s|>|/)`, "i").test(s);
	};
	const isCloseAt = (pos) => {
		const s = source.slice(pos);
		return new RegExp(String.raw`^<\s*\/\s*${lowerTag}(?=\s|>)`, "i").test(s);
	};
	while (i < source.length) {
		const lt = source.indexOf("<", i);
		if (lt === -1) return {
			raw: source.slice(openStart),
			end: source.length
		};
		if (isCloseAt(lt)) {
			const gt = source.indexOf(">", lt);
			if (gt === -1) return null;
			depth--;
			if (depth === 0) {
				const end = gt + 1;
				return {
					raw: source.slice(openStart, end),
					end
				};
			}
			i = gt + 1;
			continue;
		}
		if (isOpenAt(lt)) {
			const rel = findTagCloseIndexOutsideQuotes(source.slice(lt));
			if (rel === -1) return null;
			depth++;
			i = lt + rel + 1;
			continue;
		}
		i = lt + 1;
	}
	return {
		raw: source.slice(openStart),
		end: source.length
	};
}
function clampNonNegative(n) {
	return Number.isFinite(n) && n > 0 ? n : 0;
}
function lineToIndex(source, line) {
	const targetLine = clampNonNegative(line);
	if (!source || targetLine <= 0) return 0;
	let currentLine = 0;
	for (let i = 0; i < source.length; i++) if (source[i] === "\n") {
		currentLine++;
		if (currentLine === targetLine) return i + 1;
	}
	return source.length;
}
function parseBasicBlockToken(tokens, index, options) {
	const token = tokens[index];
	switch (token.type) {
		case "heading_open": return [parseHeading(tokens, index, options), index + 3];
		case "code_block": return [parseCodeBlock(token), index + 1];
		case "fence": return [parseFenceToken(token), index + 1];
		case "math_block": return [parseMathBlock(token), index + 1];
		case "html_block": {
			const htmlBlockNode = parseHtmlBlock(token);
			const tagSets = htmlBlockNode.tag ? getHtmlTagSets(options?.customHtmlTags) : null;
			if (htmlBlockNode.tag && htmlBlockNode.loading && tagSets && !tagSets.allowedTagSet.has(htmlBlockNode.tag)) {
				const content = String(token.content ?? "").replace(/\n+$/, "");
				return [{
					type: "paragraph",
					children: content ? [{
						type: "text",
						content,
						raw: content
					}] : [],
					raw: content
				}, index + 1];
			}
			if (htmlBlockNode.tag && tagSets?.customTagSet?.has(htmlBlockNode.tag)) {
				const tag = htmlBlockNode.tag;
				const source = String(options?.__sourceMarkdown ?? "");
				const cursor = Number(options?.__customHtmlBlockCursor ?? 0);
				const mappedLineStart = Array.isArray(token.map) ? lineToIndex(source, Number(token.map?.[0] ?? 0)) : 0;
				const fromSource = findNextCustomHtmlBlockFromSource(source, tag, Math.max(clampNonNegative(cursor), clampNonNegative(mappedLineStart)));
				if (fromSource && options) options.__customHtmlBlockCursor = fromSource.end;
				const rawHtml = String(fromSource?.raw ?? htmlBlockNode.raw ?? "");
				const openEnd = findTagCloseIndexOutsideQuotes(rawHtml);
				const openTag = openEnd !== -1 ? rawHtml.slice(0, openEnd + 1) : rawHtml;
				const selfClosing = openEnd !== -1 && /\/\s*>\s*$/.test(openTag);
				const closeRange = openEnd === -1 ? null : findMatchingCloseTagRange(rawHtml, tag, openEnd + 1);
				const closeIndex = closeRange?.start ?? -1;
				let inner = "";
				if (openEnd !== -1) if (closeIndex !== -1 && openEnd < closeIndex) inner = rawHtml.slice(openEnd + 1, closeIndex);
				else inner = rawHtml.slice(openEnd + 1);
				if (closeIndex === -1) inner = stripTrailingPartialClosingTag(inner, tag);
				const attrs = [];
				const attrRegex = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
				let m;
				while ((m = attrRegex.exec(openTag)) !== null) {
					const name = m[1];
					if (!name || name.toLowerCase() === tag) continue;
					const value = m[2] || m[3] || m[4] || "";
					attrs.push([name, value]);
				}
				const loading = !options?.final && !selfClosing && closeRange == null;
				return [{
					type: tag,
					tag,
					content: stripWrapperNewlines(inner),
					raw: String(fromSource?.raw ?? htmlBlockNode.raw ?? rawHtml),
					loading,
					attrs: attrs.length ? attrs : void 0
				}, index + 1];
			}
			return [htmlBlockNode, index + 1];
		}
		case "table_open": {
			const [tableNode, newIndex] = parseTable(tokens, index, options);
			return [tableNode, newIndex];
		}
		case "dl_open": {
			const [definitionListNode, newIndex] = parseDefinitionList(tokens, index, options);
			return [definitionListNode, newIndex];
		}
		case "footnote_open": {
			const [footnoteNode, newIndex] = parseFootnote(tokens, index, options);
			return [footnoteNode, newIndex];
		}
		case "hr": return [parseThematicBreak(), index + 1];
		default: break;
	}
	return null;
}
function parseCommonBlockToken(tokens, index, options, handlers) {
	const basicResult = parseBasicBlockToken(tokens, index, options);
	if (basicResult) return basicResult;
	switch (tokens[index].type) {
		case "container_warning_open":
		case "container_info_open":
		case "container_note_open":
		case "container_tip_open":
		case "container_danger_open":
		case "container_caution_open":
		case "container_error_open":
			if (handlers?.parseContainer) return handlers.parseContainer(tokens, index, options);
			break;
		case "container_open":
			if (handlers?.matchAdmonition) {
				const result = handlers.matchAdmonition(tokens, index, options);
				if (result) return result;
			}
			break;
		case "vmr_container_open": return parseVmrContainer(tokens, index, options);
		default: break;
	}
	return null;
}

//#endregion
//#region src/parser/node-parsers/hardbreak-parser.ts
function parseHardBreak() {
	return {
		type: "hardbreak",
		raw: "\\\n"
	};
}

//#endregion
//#region src/parser/node-parsers/paragraph-parser.ts
function parseParagraph(tokens, index, options) {
	const paragraphContentToken = tokens[index + 1];
	const paragraphContent = String(paragraphContentToken.content ?? "");
	return {
		type: "paragraph",
		children: parseInlineTokens(paragraphContentToken.children || [], paragraphContent, void 0, options),
		raw: paragraphContent
	};
}

//#endregion
//#region src/parser/index.ts
const streamParseEnvCache = /* @__PURE__ */ new WeakMap();
const tolerantMathBoundaryStreamCache = /* @__PURE__ */ new WeakMap();
const TOLERANT_BOUNDARY_SPLIT_OPENERS = ["$$", "\\["];
function getNodeFields(node) {
	return node;
}
function getParserNow() {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}
function addTiming(metrics, key, value) {
	if (!metrics) return;
	metrics[key] = (metrics[key] ?? 0) + value;
}
function getParseTiming(options) {
	return options.__timing;
}
function finishTimedParse(result, timing, startedAt) {
	if (timing) addTiming(timing, "parseMarkdownToStructureTotalMs", getParserNow() - startedAt);
	return result;
}
function processTokensWithTiming(tokens, options, timing) {
	if (!timing) return processTokens(tokens, options);
	const startedAt = getParserNow();
	const result = processTokens(tokens, options);
	addTiming(timing, "processTokensMs", getParserNow() - startedAt);
	return result;
}
function getCustomHtmlTagSet(options) {
	const custom = options?.customHtmlTags;
	if (!Array.isArray(custom) || custom.length === 0) return null;
	const normalized = normalizeCustomHtmlTags(custom);
	return normalized.length ? new Set(normalized) : null;
}
function getStableStreamEnv(md, env) {
	const mdKey = md;
	let byMode = streamParseEnvCache.get(mdKey);
	if (!byMode) {
		byMode = /* @__PURE__ */ new Map();
		streamParseEnvCache.set(mdKey, byMode);
	}
	const modeKey = env.__markstreamFinal === true ? "final" : "streaming";
	let stableEnv = byMode.get(modeKey);
	if (!stableEnv) {
		stableEnv = {};
		byMode.set(modeKey, stableEnv);
	}
	for (const key of Object.keys(stableEnv)) if (!Object.prototype.hasOwnProperty.call(env, key)) delete stableEnv[key];
	Object.assign(stableEnv, env);
	return stableEnv;
}
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
function copyCloneableOwnDataProperties(source, target, seen) {
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = Object.getOwnPropertyDescriptor(source, key);
		if (!descriptor || !("value" in descriptor)) continue;
		const targetDescriptor = Object.getOwnPropertyDescriptor(target, key);
		if (targetDescriptor && (!("value" in targetDescriptor) || targetDescriptor.writable === false)) continue;
		target[key] = safeCloneTokenField(descriptor.value, seen);
	}
}
function safeCloneTokenField(value, seen = /* @__PURE__ */ new WeakMap()) {
	if (!value || typeof value !== "object") return value;
	const object = value;
	const existing = seen.get(object);
	if (existing) return existing;
	if (Array.isArray(value)) {
		const cloned$1 = [];
		seen.set(object, cloned$1);
		for (const item of value) cloned$1.push(safeCloneTokenField(item, seen));
		return cloned$1;
	}
	if (value instanceof Map) {
		const cloned$1 = /* @__PURE__ */ new Map();
		seen.set(object, cloned$1);
		for (const [key, item] of value) cloned$1.set(safeCloneTokenField(key, seen), safeCloneTokenField(item, seen));
		return cloned$1;
	}
	if (value instanceof Set) {
		const cloned$1 = /* @__PURE__ */ new Set();
		seen.set(object, cloned$1);
		for (const item of value) cloned$1.add(safeCloneTokenField(item, seen));
		return cloned$1;
	}
	if (value instanceof Date) {
		const cloned$1 = new Date(value.getTime());
		seen.set(object, cloned$1);
		return cloned$1;
	}
	if (value instanceof RegExp) {
		const cloned$1 = new RegExp(value.source, value.flags);
		cloned$1.lastIndex = value.lastIndex;
		seen.set(object, cloned$1);
		return cloned$1;
	}
	if (typeof URL !== "undefined" && value instanceof URL) {
		const cloned$1 = new URL(value.href);
		seen.set(object, cloned$1);
		copyCloneableOwnDataProperties(object, cloned$1, seen);
		return cloned$1;
	}
	if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
		const cloned$1 = new URLSearchParams(value.toString());
		seen.set(object, cloned$1);
		copyCloneableOwnDataProperties(object, cloned$1, seen);
		return cloned$1;
	}
	if (value instanceof Error) {
		let cloned$1;
		const ErrorCtor = value.constructor;
		try {
			cloned$1 = new ErrorCtor(value.message);
		} catch {
			cloned$1 = new Error(value.message);
		}
		Object.setPrototypeOf(cloned$1, Object.getPrototypeOf(value));
		seen.set(object, cloned$1);
		copyCloneableOwnDataProperties(object, cloned$1, seen);
		return cloned$1;
	}
	if (typeof Promise !== "undefined" && value instanceof Promise) {
		seen.set(object, value);
		return value;
	}
	if (typeof Node !== "undefined" && value instanceof Node) {
		seen.set(object, value);
		return value;
	}
	if (!isPlainObject(value)) {
		const cloned$1 = Object.create(Object.getPrototypeOf(value));
		seen.set(object, cloned$1);
		copyCloneableOwnDataProperties(object, cloned$1, seen);
		return cloned$1;
	}
	const cloned = {};
	seen.set(object, cloned);
	const record = value;
	for (const key of Object.keys(record)) cloned[key] = safeCloneTokenField(record[key], seen);
	return cloned;
}
function cloneMarkdownToken(token, cloneObjectFields = true) {
	if (!cloneObjectFields) return cloneTokenWithMutableChildren(token);
	const cloned = Object.create(Object.getPrototypeOf(token));
	const seen = /* @__PURE__ */ new WeakMap();
	for (const key of Reflect.ownKeys(token)) {
		const descriptor = Object.getOwnPropertyDescriptor(token, key);
		if (!descriptor) continue;
		if (!("value" in descriptor)) {
			Object.defineProperty(cloned, key, descriptor);
			continue;
		}
		const value = descriptor.value;
		let clonedValue = value;
		if (key === "attrs" && Array.isArray(value)) clonedValue = value.map((attr) => [...attr]);
		else if (key === "map" && Array.isArray(value)) clonedValue = [...value];
		else if (key === "children" && Array.isArray(value)) clonedValue = value.map((child) => cloneMarkdownToken(child, cloneObjectFields));
		else if (cloneObjectFields && value && typeof value === "object") clonedValue = safeCloneTokenField(value, seen);
		Object.defineProperty(cloned, key, {
			...descriptor,
			value: clonedValue
		});
	}
	return cloned;
}
function cloneMarkdownTokens(tokens, cloneObjectFields = true) {
	return tokens.map((token) => cloneMarkdownToken(token, cloneObjectFields));
}
function shouldUseTopLevelStreamParse(md, options) {
	const internalOptions = options;
	const stream = md.stream;
	const streamParse = options.streamParse ?? "auto";
	return internalOptions.__disableStreamParse !== true && (streamParse === true || streamParse === "auto" && options.final !== true) && stream?.enabled === true && typeof stream.parse === "function";
}
function shouldResetTopLevelStreamCacheForFinalAutoParse(md, options) {
	const internalOptions = options;
	const streamParse = options.streamParse ?? "auto";
	const stream = md.stream;
	return options.final === true && streamParse === "auto" && internalOptions.__disableStreamParse !== true && stream?.enabled === true && typeof stream.reset === "function";
}
function clearTolerantMathBoundaryStreamCache(md) {
	tolerantMathBoundaryStreamCache.delete(md);
}
function setTolerantMathBoundaryStreamCache(md, source, key) {
	tolerantMathBoundaryStreamCache.set(md, {
		source,
		key,
		pendingCandidate: key === null && mayContainTolerantMathBlockBoundaryOpener(source)
	});
}
function sourceEndsWithSplitTolerantBoundaryPrefix(source) {
	return source.endsWith("$") || source.endsWith("\\");
}
function sourceEndsWithCompleteTolerantBoundaryOpener(source) {
	const lastLineStart = Math.max(source.lastIndexOf("\n") + 1, 0);
	const lastLine = source.slice(lastLineStart).replace(/[\t ]+$/, "");
	return TOLERANT_BOUNDARY_SPLIT_OPENERS.some((open) => lastLine.endsWith(open));
}
function appendedChunkMayAffectTolerantMathBoundary(previousSource, appended) {
	if (!appended) return false;
	if (appended.includes("$$") || appended.includes("\\[") || appended.includes("\\]")) return true;
	if (previousSource.endsWith("$") && appended[0] === "$") return true;
	if (previousSource.endsWith("\\") && (appended[0] === "[" || appended[0] === "]")) return true;
	if (sourceEndsWithCompleteTolerantBoundaryOpener(previousSource) && /[\r\n]/.test(appended)) return true;
	return false;
}
function syncTolerantMathBoundaryStreamCache(md, source) {
	if (!hasMarkstreamMathPlugin(md)) return;
	const stream = md.stream;
	if (typeof stream?.reset !== "function") return;
	const owner = md;
	const previous = tolerantMathBoundaryStreamCache.get(owner);
	if (previous?.source === source) return;
	if (previous && source.startsWith(previous.source)) {
		const appended = source.slice(previous.source.length);
		if (previous.key === null && previous.pendingCandidate === false && !appendedChunkMayAffectTolerantMathBoundary(previous.source, appended) && !sourceEndsWithSplitTolerantBoundaryPrefix(source)) {
			previous.source = source;
			return;
		}
	}
	const nextKey = getTolerantMathBlockBoundaryStreamKey(source);
	const sourceWasReplaced = previous ? !source.startsWith(previous.source) : false;
	if (previous && (sourceWasReplaced || previous.key !== nextKey)) stream.reset();
	else if (!previous && nextKey) stream.reset();
	setTolerantMathBoundaryStreamCache(md, source, nextKey);
}
function shouldCloneTopLevelStreamTokens(options) {
	return typeof options.preTransformTokens === "function" || typeof options.postTransformTokens === "function";
}
function sameTokenMap(left, right) {
	const leftMap = left?.map;
	const rightMap = right?.map;
	if (leftMap === rightMap) return true;
	if (!Array.isArray(leftMap) || !Array.isArray(rightMap)) return false;
	return leftMap.length === rightMap.length && leftMap.every((value, index) => value === rightMap[index]);
}
function isSameTokenShape(left, right) {
	return !!left && !!right && left.type === right.type && left.tag === right.tag && left.nesting === right.nesting && left.markup === right.markup && left.content === right.content && sameTokenMap(left, right);
}
function isParagraphTokenTriplet(tokens, index) {
	return tokens[index]?.type === "paragraph_open" && tokens[index + 1]?.type === "inline" && tokens[index + 2]?.type === "paragraph_close";
}
function hasAdjacentDuplicateParagraphTokenTriplet(tokens) {
	for (let index = 0; index + 5 < tokens.length; index++) if (isParagraphTokenTriplet(tokens, index) && isParagraphTokenTriplet(tokens, index + 3) && isSameTokenShape(tokens[index], tokens[index + 3]) && isSameTokenShape(tokens[index + 1], tokens[index + 4]) && isSameTokenShape(tokens[index + 2], tokens[index + 5])) return true;
	return false;
}
function shouldFallbackDuplicateTolerantMathStreamTokens(md, source, tokens) {
	return hasMarkstreamMathPlugin(md) && mayContainTolerantMathBlockBoundaryOpener(source) && hasAdjacentDuplicateParagraphTokenTriplet(tokens);
}
function shouldUseSyncParseForPendingTolerantMathBoundary(md) {
	const cache = tolerantMathBoundaryStreamCache.get(md);
	return typeof cache?.key === "string" && cache.key.startsWith("pending:");
}
function parseTopLevelTokens(md, source, env, options) {
	if (options.customHtmlTags?.length) env.__markstreamCustomHtmlTags = options.customHtmlTags;
	if (!shouldUseTopLevelStreamParse(md, options)) return md.parse(source, env);
	syncTolerantMathBoundaryStreamCache(md, source);
	if (shouldUseSyncParseForPendingTolerantMathBoundary(md)) return md.parse(source, env);
	const tokens = md.stream.parse(source, getStableStreamEnv(md, env));
	if (shouldFallbackDuplicateTolerantMathStreamTokens(md, source, tokens)) {
		md.stream?.reset?.();
		return md.parse(source, env);
	}
	if (!shouldCloneTopLevelStreamTokens(options)) return tokens;
	const timing = getParseTiming(options);
	if (!timing) return cloneMarkdownTokens(tokens, true);
	const startedAt = getParserNow();
	const cloned = cloneMarkdownTokens(tokens, true);
	addTiming(timing, "tokenCloneMs", getParserNow() - startedAt);
	return cloned;
}
function buildAllowedHtmlTagSet(options) {
	const custom = options?.customHtmlTags;
	if (!Array.isArray(custom) || custom.length === 0) return STANDARD_HTML_TAGS;
	const set = new Set(STANDARD_HTML_TAGS);
	for (const name of normalizeCustomHtmlTags(custom)) if (name) set.add(name);
	return set;
}
function stringifyInlineNodeRaw(node) {
	const raw = node.raw;
	if (typeof raw === "string") return raw;
	const content = getNodeFields(node).content;
	if (typeof content === "string") return content;
	if (node.type === "hardbreak") return "<br>";
	return "";
}
function buildParagraphFromInlineChildren(children) {
	return {
		type: "paragraph",
		children,
		raw: children.map(stringifyInlineNodeRaw).join("")
	};
}
function maybePromoteCustomNodeFromParagraph(node, options) {
	if (node.type !== "paragraph") return null;
	const nodeChildren = getNodeFields(node).children;
	const children = Array.isArray(nodeChildren) ? nodeChildren : [];
	if (children.length === 0) return null;
	const customTagSet = getCustomHtmlTagSet(options);
	if (!customTagSet?.size) return null;
	let customIndex = -1;
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (!customTagSet.has(String(child?.type ?? "").toLowerCase())) continue;
		const prefixChildren$1 = children.slice(0, i);
		if (!String(getNodeFields(child).content ?? "").trim()) continue;
		if (!prefixChildren$1.some((prefixChild) => prefixChild?.type === "hardbreak")) continue;
		customIndex = i;
		break;
	}
	if (customIndex === -1) return null;
	const prefixChildren = children.slice(0, customIndex);
	const promoted = children[customIndex];
	if (!promoted) return null;
	const result = [];
	if (prefixChildren.length) result.push(buildParagraphFromInlineChildren(prefixChildren));
	result.push(promoted);
	const suffixChildren = children.slice(customIndex + 1);
	if (suffixChildren.length) result.push(buildParagraphFromInlineChildren(suffixChildren));
	return result;
}
function parseStandaloneHtmlDocument(markdown) {
	const trimmed = markdown.trim();
	if (!trimmed) return null;
	const startsLikeHtmlDocument = /^(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s[^>]*)?>/i.test(trimmed);
	const endsWithHtmlClose = /<\/html>\s*$/i.test(trimmed);
	if (!startsLikeHtmlDocument || !endsWithHtmlClose) return null;
	return [{
		type: "html_block",
		tag: "html",
		raw: markdown,
		content: markdown,
		loading: false
	}];
}
function getMergeableNodeRaw(node) {
	const raw = node.raw;
	if (typeof raw === "string") return raw;
	const content = getNodeFields(node).content;
	if (typeof content === "string") return content;
	return "";
}
function isCloseOnlyHtmlBlockForTag(node, tag) {
	if (node.type !== "html_block" || !tag) return false;
	const raw = String(node.raw ?? node.content ?? "");
	return new RegExp(String.raw`^\s*<\s*\/\s*${escapeTagForRegExp(tag)}\s*>\s*$`, "i").test(raw);
}
function findNextHtmlBlockFromSource(source, tag, startIndex) {
	if (!source || !tag) return null;
	const lowerTag = tag.toLowerCase();
	const openRe = new RegExp(String.raw`<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, "gi");
	openRe.lastIndex = Math.max(0, startIndex);
	const openMatch = openRe.exec(source);
	if (!openMatch || openMatch.index == null) return null;
	const start = openMatch.index;
	const openEndRel = findTagCloseIndexOutsideQuotes(source.slice(start));
	if (openEndRel === -1) return null;
	const openEnd = start + openEndRel;
	const openTag = source.slice(start, openEnd + 1);
	if (VOID_HTML_TAGS.has(lowerTag) || /\/\s*>$/.test(openTag)) return {
		raw: openTag,
		start,
		end: openEnd + 1,
		closed: true
	};
	let depth = 1;
	let index = openEnd + 1;
	const isOpenAt = (pos) => {
		const slice = source.slice(pos);
		return new RegExp(String.raw`^<\s*${escapeTagForRegExp(lowerTag)}(?=\s|>|/)`, "i").test(slice);
	};
	const isCloseAt = (pos) => {
		const slice = source.slice(pos);
		return new RegExp(String.raw`^<\s*\/\s*${escapeTagForRegExp(lowerTag)}(?=\s|>)`, "i").test(slice);
	};
	while (index < source.length) {
		const lt = source.indexOf("<", index);
		if (lt === -1) return {
			raw: source.slice(start),
			start,
			end: source.length,
			closed: false
		};
		if (isCloseAt(lt)) {
			const endRel = findTagCloseIndexOutsideQuotes(source.slice(lt));
			if (endRel === -1) return null;
			depth--;
			const end = lt + endRel + 1;
			if (depth === 0) return {
				raw: source.slice(start, end),
				start,
				end,
				closed: true
			};
			index = end;
			continue;
		}
		if (isOpenAt(lt)) {
			const endRel = findTagCloseIndexOutsideQuotes(source.slice(lt));
			if (endRel === -1) return null;
			const raw = source.slice(lt, lt + endRel + 1);
			if (!/\/\s*>$/.test(raw)) depth++;
			index = lt + endRel + 1;
			continue;
		}
		index = lt + 1;
	}
	return {
		raw: source.slice(start),
		start,
		end: source.length,
		closed: false
	};
}
function findApproximateConsumedPrefixEnd(exact, approximate) {
	if (!approximate) return 0;
	let i = 0;
	let j = 0;
	while (i < exact.length && j < approximate.length) {
		if (exact[i] === approximate[j]) {
			i++;
			j++;
			continue;
		}
		if (exact[i] === "\r" || exact[i] === "\n") {
			i++;
			continue;
		}
		return -1;
	}
	return j === approximate.length ? i : -1;
}
function buildHtmlBlockContent(raw, tag, closed) {
	if (closed) return raw;
	return `${raw.replace(/<[^>]*$/, "")}\n</${tag}>`;
}
function normalizeIndentedSourceForLookup(value) {
	return value.replace(/\r\n/g, "\n").replace(/(^|\n)[ \t]{1,4}/g, "$1");
}
function canFindNodeRawAfterSourceIndex(source, startIndex, nodeRaw) {
	if (!nodeRaw) return false;
	if (source.includes(nodeRaw, startIndex)) return true;
	return normalizeIndentedSourceForLookup(source.slice(Math.max(0, startIndex))).includes(normalizeIndentedSourceForLookup(nodeRaw));
}
function extendHtmlBlockCloseToLineEnding(source, startIndex) {
	let end = Math.max(0, startIndex);
	while (end < source.length && (source[end] === " " || source[end] === "	")) end++;
	if (source[end] === "\r") {
		end++;
		if (source[end] === "\n") end++;
		return end;
	}
	if (source[end] === "\n") return end + 1;
	return startIndex;
}
function isDetailsOpenHtmlBlock(node) {
	if (node.type !== "html_block") return false;
	if (String(node.tag ?? "").toLowerCase() !== "details") return false;
	const raw = String(node.raw ?? node.content ?? "");
	return /^\s*<details\b/i.test(raw);
}
function isDetailsCloseHtmlBlock(node) {
	if (node.type !== "html_block") return false;
	const raw = String(node.raw ?? node.content ?? "");
	return /^\s*<\/details\b/i.test(raw);
}
function findLastClosingTagStart(raw, tag) {
	const closeRe = new RegExp(String.raw`<\s*\/\s*${escapeTagForRegExp(tag)}(?=\s|>)`, "gi");
	let last = -1;
	let match;
	while ((match = closeRe.exec(raw)) !== null) last = match.index;
	return last;
}
function buildDetailsChildParseOptions(options, final) {
	return {
		final,
		__disableStreamParse: true,
		requireClosingStrong: options.requireClosingStrong,
		customHtmlTags: options.customHtmlTags,
		validateLink: options.validateLink
	};
}
const STRUCTURED_HTML_WRAPPER_BLOCK_TYPES = new Set([
	"admonition",
	"blockquote",
	"code_block",
	"definition_list",
	"footnote",
	"heading",
	"list",
	"math_block",
	"table",
	"thematic_break"
]);
const STRUCTURED_HTML_WRAPPER_MARKER_RE = /(?:^|\n)\s{0,3}(?:#{1,6}\s+\S|[-+*]\s+\S|\d+[.)]\s+\S|>\s*\S|`{3,}|~{3,}|(?:\*{3,}|-{3,}|_{3,})(?:\s|$)|\|.*\|)/m;
function hasStructuredHtmlWrapperMarkers(fragment) {
	return /\n\s*\n/.test(fragment) || STRUCTURED_HTML_WRAPPER_MARKER_RE.test(fragment);
}
function shouldStructureGenericHtmlBlockChildren(innerRaw, children) {
	if (!innerRaw.trim() || children.length === 0) return false;
	if (children.some((child) => STRUCTURED_HTML_WRAPPER_BLOCK_TYPES.has(String(child?.type ?? "").toLowerCase()))) return true;
	if (children.some((child) => {
		if (child?.type !== "html_block") return false;
		const childFields = getNodeFields(child);
		return Array.isArray(childFields.children) && childFields.children.length > 0;
	})) return true;
	if (!hasStructuredHtmlWrapperMarkers(innerRaw)) return false;
	if (children.length > 1) return true;
	const [first] = children;
	return Boolean(first && first.type === "paragraph");
}
function structureGenericHtmlBlockChildren(nodes, md, options, final) {
	return nodes.map((node) => {
		if (node?.type !== "html_block") return node;
		const fields = getNodeFields(node);
		const tag = String(fields.tag ?? "").toLowerCase();
		if (!tag || tag === "details" || NON_STRUCTURING_HTML_TAGS.has(tag) || Array.isArray(fields.children)) return node;
		const raw = String(node.raw ?? fields.content ?? "");
		if (!raw) return node;
		const openEnd = findTagCloseIndexOutsideQuotes(raw);
		if (openEnd === -1) return node;
		const closeStart = findLastClosingTagStart(raw, tag);
		const innerRaw = closeStart !== -1 && closeStart >= openEnd + 1 ? raw.slice(openEnd + 1, closeStart) : raw.slice(openEnd + 1);
		if (!innerRaw.trim()) return node;
		const children = parseDetailsFragmentChildren(innerRaw, md, buildDetailsChildParseOptions(options, final));
		if (!shouldStructureGenericHtmlBlockChildren(innerRaw, children)) return node;
		return {
			...node,
			children
		};
	});
}
function parseDetailsFragmentChildren(fragment, md, options) {
	if (!fragment.trim()) return [];
	return parseMarkdownToStructure(fragment, md, {
		...options,
		__disableStreamParse: true
	});
}
function parseSummaryChildren(fragment, md, options) {
	const children = parseDetailsFragmentChildren(fragment, md, options);
	const onlyChild = children[0];
	if (children.length === 1 && onlyChild?.type === "paragraph" && Array.isArray(onlyChild.children)) return onlyChild.children;
	return children;
}
function buildStructuredSummaryNode(summaryRaw, md, options) {
	const summaryNode = parseHtmlBlock({ content: summaryRaw });
	const openEnd = findTagCloseIndexOutsideQuotes(summaryRaw);
	const closeStart = findLastClosingTagStart(summaryRaw, "summary");
	if (openEnd !== -1 && closeStart !== -1 && closeStart >= openEnd + 1) {
		const children = parseSummaryChildren(summaryRaw.slice(openEnd + 1, closeStart), md, options);
		if (children.length > 0) summaryNode.children = children;
	}
	summaryNode.raw = summaryRaw;
	return summaryNode;
}
function buildDetailsPrefixChildren(openRaw, md, options) {
	const openEnd = findTagCloseIndexOutsideQuotes(openRaw);
	if (openEnd === -1) return [];
	const innerPrefix = openRaw.slice(openEnd + 1);
	if (!innerPrefix.trim()) return [];
	const summaryBlock = findNextHtmlBlockFromSource(innerPrefix, "summary", 0);
	if (!summaryBlock) return parseDetailsFragmentChildren(innerPrefix, md, options);
	const beforeSummary = innerPrefix.slice(0, summaryBlock.start);
	const afterSummary = innerPrefix.slice(summaryBlock.end);
	return [
		...parseDetailsFragmentChildren(beforeSummary, md, options),
		buildStructuredSummaryNode(summaryBlock.raw, md, options),
		...parseDetailsFragmentChildren(afterSummary, md, options)
	];
}
function combineStructuredDetailsHtmlBlocks(nodes, source, md, options, final, sourceCursor = 0) {
	const merged = [];
	let cursor = sourceCursor;
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const nodeRaw = getMergeableNodeRaw(node);
		let nodePos = -1;
		if (nodeRaw) {
			nodePos = source.indexOf(nodeRaw, cursor);
			if (nodePos !== -1) cursor = nodePos + nodeRaw.length;
		}
		if (!isDetailsOpenHtmlBlock(node)) {
			merged.push(node);
			continue;
		}
		const openRaw = String(node.raw ?? getMergeableNodeRaw(node) ?? "");
		const openStart = nodePos !== -1 ? nodePos : source.indexOf(openRaw, Math.max(0, cursor - openRaw.length));
		if (openStart === -1) {
			merged.push(node);
			continue;
		}
		let depth = 1;
		let closeIndex = -1;
		for (let j = i + 1; j < nodes.length; j++) {
			const current = nodes[j];
			if (isDetailsOpenHtmlBlock(current)) {
				depth++;
				continue;
			}
			if (!isDetailsCloseHtmlBlock(current)) continue;
			depth--;
			if (depth === 0) {
				closeIndex = j;
				break;
			}
		}
		const exact = findNextHtmlBlockFromSource(source, "details", openStart);
		const selfContained = closeIndex === -1 && exact?.closed === true;
		const effectiveOpenRaw = selfContained ? (() => {
			const ct = findLastClosingTagStart(openRaw, "details");
			return ct !== -1 ? openRaw.slice(0, ct) : openRaw;
		})() : openRaw;
		const [children] = combineStructuredDetailsHtmlBlocks(selfContained ? [] : closeIndex === -1 ? nodes.slice(i + 1) : nodes.slice(i + 1, closeIndex), source, md, options, final, openStart + openRaw.length);
		const prefixChildren = buildDetailsPrefixChildren(effectiveOpenRaw, md, buildDetailsChildParseOptions(options, final));
		const closeRaw = closeIndex === -1 ? "</details>" : String(nodes[closeIndex].raw ?? getMergeableNodeRaw(nodes[closeIndex]) ?? "</details>");
		const explicitClose = selfContained || closeIndex !== -1 && exact?.closed === true;
		const trimmedCloseRaw = closeRaw.replace(/[\t\r\n ]+$/, "");
		const closeStart = explicitClose ? (() => {
			const closeOffset = (exact?.raw ?? "").lastIndexOf(trimmedCloseRaw);
			return closeOffset === -1 ? source.length : openStart + closeOffset;
		})() : source.length;
		const openTagEndIndex = findTagCloseIndexOutsideQuotes(openRaw);
		const middleSourceStart = selfContained && openTagEndIndex !== -1 ? openStart + openTagEndIndex + 1 : openStart + openRaw.length;
		const middleSource = source.slice(middleSourceStart, closeStart === -1 ? source.length : closeStart);
		const middleTokens = md.parse(middleSource, { __markstreamFinal: final });
		const renderedMiddle = md.renderer.render(middleTokens, md.options, { __markstreamFinal: final });
		const closeMarkupEnd = closeStart + trimmedCloseRaw.length;
		const closeSliceEnd = explicitClose ? Math.max(closeStart + closeRaw.length, extendHtmlBlockCloseToLineEnding(source, closeMarkupEnd)) : source.length;
		const renderedCloseRaw = explicitClose ? source.slice(closeStart, closeSliceEnd) : closeRaw;
		const mergedRaw = explicitClose ? source.slice(openStart, closeSliceEnd) : source.slice(openStart);
		const contentPrefix = selfContained && openTagEndIndex !== -1 ? openRaw.slice(0, openTagEndIndex + 1) : openRaw;
		merged.push({
			...node,
			tag: "details",
			attrs: parseTagAttrs(openRaw.slice(0, openTagEndIndex + 1)),
			raw: mergedRaw,
			content: `${contentPrefix}${renderedMiddle}${renderedCloseRaw}`,
			children: [...prefixChildren, ...children],
			loading: !final && !explicitClose
		});
		cursor = explicitClose ? closeSliceEnd : source.length;
		if (closeIndex === -1 && !selfContained) break;
		if (closeIndex !== -1) i = closeIndex;
	}
	return [merged, cursor];
}
function mergeSplitTopLevelHtmlBlocks(nodes, final, source) {
	if (!source) return nodes;
	const merged = nodes.slice();
	let sourceHtmlCursor = 0;
	for (let i = 0; i < merged.length; i++) {
		const node = merged[i];
		const nodeRaw = getMergeableNodeRaw(node);
		const nodePos = nodeRaw ? source.indexOf(nodeRaw, sourceHtmlCursor) : -1;
		if (node?.type !== "html_block") {
			if (nodePos !== -1) sourceHtmlCursor = nodePos + nodeRaw.length;
			continue;
		}
		const tag = String(node.tag ?? "").toLowerCase();
		if (!tag) continue;
		if (tag === "details") {
			if (nodePos !== -1) sourceHtmlCursor = nodePos + nodeRaw.length;
			continue;
		}
		const exact = findNextHtmlBlockFromSource(source, tag, nodePos !== -1 ? nodePos : sourceHtmlCursor);
		if (!exact) continue;
		sourceHtmlCursor = exact.end;
		const currentContent = String(node.content ?? nodeRaw);
		const currentRaw = String(node.raw ?? currentContent);
		const nextContent = buildHtmlBlockContent(exact.raw, tag, exact.closed);
		const desiredLoading = !final && !exact.closed;
		const needsExpansion = currentContent !== nextContent || currentRaw !== exact.raw || Boolean(node.loading) !== desiredLoading;
		const exactOpenEnd = findTagCloseIndexOutsideQuotes(exact.raw);
		const exactOpenTag = exactOpenEnd === -1 ? "" : exact.raw.slice(0, exactOpenEnd + 1);
		const exactAttrs = exactOpenTag ? parseTagAttrs(exactOpenTag) : [];
		node.content = nextContent;
		node.raw = exact.raw;
		node.loading = desiredLoading;
		node.attrs = exactAttrs.length ? exactAttrs : void 0;
		if (!needsExpansion) continue;
		let tailCursor = findApproximateConsumedPrefixEnd(exact.raw, currentRaw);
		if (tailCursor === -1) tailCursor = 0;
		const j = i + 1;
		while (j < merged.length) {
			if (exact.closed && isCloseOnlyHtmlBlockForTag(merged[j], tag)) {
				merged.splice(j, 1);
				continue;
			}
			const nextRaw = getMergeableNodeRaw(merged[j]);
			if (!nextRaw) break;
			const nextPos = exact.raw.indexOf(nextRaw, tailCursor);
			if (nextPos === -1) {
				if (canFindNodeRawAfterSourceIndex(source, exact.end, nextRaw)) break;
				merged.splice(j, 1);
				continue;
			}
			tailCursor = nextPos + nextRaw.length;
			merged.splice(j, 1);
		}
	}
	return merged;
}
function stripDanglingHtmlLikeTail(markdown) {
	const isWs = (ch) => ch === " " || ch === "	" || ch === "\n" || ch === "\r";
	const isLikelyHtmlTagPrefix = (tail$1) => {
		if (!tail$1 || tail$1[0] !== "<") return false;
		if (tail$1.includes(">")) return false;
		let i = 1;
		if (i < tail$1.length && isWs(tail$1[i])) return false;
		if (tail$1[i] === "/") {
			i++;
			if (i < tail$1.length && isWs(tail$1[i])) return false;
		}
		const isAlpha = (ch) => {
			const c = ch.charCodeAt(0);
			return c >= 65 && c <= 90 || c >= 97 && c <= 122;
		};
		const isDigit$2 = (ch) => {
			const c = ch.charCodeAt(0);
			return c >= 48 && c <= 57;
		};
		const isNameStart = (ch) => ch === "!" || isAlpha(ch);
		const isNameChar = (ch) => isAlpha(ch) || isDigit$2(ch) || ch === ":" || ch === "-";
		const isAttrStart = (ch) => isAlpha(ch) || isDigit$2(ch) || ch === "_" || ch === "." || ch === ":" || ch === "-";
		const isAttrChar = isAttrStart;
		if (i >= tail$1.length || !isNameStart(tail$1[i])) return false;
		i++;
		while (i < tail$1.length && isNameChar(tail$1[i])) i++;
		while (i < tail$1.length) {
			while (i < tail$1.length && isWs(tail$1[i])) i++;
			if (i >= tail$1.length) return true;
			if (tail$1[i] === "/") {
				i++;
				while (i < tail$1.length && isWs(tail$1[i])) i++;
				return i >= tail$1.length;
			}
			if (!isAttrStart(tail$1[i])) return false;
			i++;
			while (i < tail$1.length && isAttrChar(tail$1[i])) i++;
			while (i < tail$1.length && isWs(tail$1[i])) i++;
			if (i < tail$1.length && tail$1[i] === "=") {
				i++;
				while (i < tail$1.length && isWs(tail$1[i])) i++;
				if (i >= tail$1.length) return true;
				const quote = tail$1[i];
				if (quote === "\"" || quote === "'") {
					i++;
					while (i < tail$1.length && tail$1[i] !== quote) i++;
					if (i >= tail$1.length) return true;
					i++;
				} else {
					while (i < tail$1.length) {
						const ch = tail$1[i];
						if (isWs(ch) || ch === "<" || ch === ">" || ch === "\"" || ch === "'" || ch === "`") break;
						i++;
					}
					if (i >= tail$1.length) return true;
				}
			}
		}
		return true;
	};
	const isInsideFencedCodeBlock = (src, pos) => {
		let inFence = false;
		let fenceChar = "";
		let fenceLen = 0;
		const isIndentWs = (ch) => ch === " " || ch === "	";
		const parseFenceMarker = (line) => {
			let i = 0;
			while (i < line.length && isIndentWs(line[i])) i++;
			const ch = line[i];
			if (ch !== "`" && ch !== "~") return null;
			let j = i;
			while (j < line.length && line[j] === ch) j++;
			const len = j - i;
			if (len < 3) return null;
			return {
				markerChar: ch,
				markerLen: len,
				rest: line.slice(j)
			};
		};
		const stripBlockquotePrefix = (line) => {
			let i = 0;
			while (i < line.length && isIndentWs(line[i])) i++;
			let saw = false;
			while (i < line.length && line[i] === ">") {
				saw = true;
				i++;
				while (i < line.length && isIndentWs(line[i])) i++;
			}
			return saw ? line.slice(i) : null;
		};
		const matchFence = (rawLine) => {
			const direct = parseFenceMarker(rawLine);
			if (direct) return direct;
			const afterQuote = stripBlockquotePrefix(rawLine);
			if (afterQuote == null) return null;
			return parseFenceMarker(afterQuote);
		};
		let offset = 0;
		const lines = src.split(/\r?\n/);
		for (const line of lines) {
			const lineStart = offset;
			const lineEnd = offset + line.length;
			if (pos < lineStart) break;
			const fenceMatch = matchFence(line);
			if (fenceMatch) {
				const markerChar = fenceMatch.markerChar;
				const markerLen = fenceMatch.markerLen;
				if (inFence) {
					if (markerChar === fenceChar && markerLen >= fenceLen) {
						if (/^\s*$/.test(fenceMatch.rest)) {
							inFence = false;
							fenceChar = "";
							fenceLen = 0;
						}
					}
				} else {
					inFence = true;
					fenceChar = markerChar;
					fenceLen = markerLen;
				}
			}
			if (pos <= lineEnd) break;
			offset = lineEnd + 1;
		}
		return inFence;
	};
	const s = String(markdown ?? "");
	const lastLt = s.lastIndexOf("<");
	if (lastLt === -1) return s;
	if (isInsideFencedCodeBlock(s, lastLt)) return s;
	if (lastLt > 0) {
		const prev = s[lastLt - 1];
		const prevIsWs = prev === " " || prev === "	" || prev === "\n" || prev === "\r";
		const prev2 = s[lastLt - 2];
		if (!prevIsWs && !((prev === "n" || prev === "r") && prev2 === "\\")) return s;
	}
	const tail = s.slice(lastLt);
	if (tail.includes(">")) return s;
	if (tail.length > 1 && (tail[1] === " " || tail[1] === "	" || tail[1] === "\n" || tail[1] === "\r")) return s;
	if (!isLikelyHtmlTagPrefix(tail)) return s;
	return s.slice(0, lastLt);
}
function ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(markdown, tags) {
	if (!markdown || !tags.length) return markdown;
	const tagSet = new Set(tags.map((t) => String(t ?? "").toLowerCase()).filter(Boolean));
	if (!tagSet.size) return markdown;
	const isIndentWs = (ch) => ch === " " || ch === "	";
	const isNameChar = (ch) => {
		const c = ch.charCodeAt(0);
		return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || ch === "_" || ch === "-" || ch === ":";
	};
	const isIndentedCodeLine = (line) => {
		if (!line) return false;
		if (line[0] === "	") return true;
		let spaces = 0;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === " ") {
				spaces++;
				if (spaces >= 4) return true;
				continue;
			}
			if (ch === "	") return true;
			break;
		}
		return false;
	};
	const findTagCloseIndexOutsideQuotes$1 = (input) => {
		let inSingle = false;
		let inDouble = false;
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "\\") {
				i++;
				continue;
			}
			if (!inDouble && ch === "'") {
				inSingle = !inSingle;
				continue;
			}
			if (!inSingle && ch === "\"") {
				inDouble = !inDouble;
				continue;
			}
			if (!inSingle && !inDouble && ch === ">") return i;
		}
		return -1;
	};
	const parseFenceMarker = (line) => {
		let i = 0;
		while (i < line.length && isIndentWs(line[i])) i++;
		const ch = line[i];
		if (ch !== "`" && ch !== "~") return null;
		let j = i;
		while (j < line.length && line[j] === ch) j++;
		const len = j - i;
		if (len < 3) return null;
		return {
			markerChar: ch,
			markerLen: len,
			rest: line.slice(j)
		};
	};
	const findInlineCustomBlockSplitIndex = (line, lineStart) => {
		if (isIndentedCodeLine(line)) return -1;
		const trimmed = line.replace(/^[ \t]+/, "");
		if (!trimmed || trimmed.startsWith(">") || trimmed.startsWith("|") || /^(?:[*+-]|\d+[.)])[\t ]+/.test(trimmed)) return -1;
		let hasRenderablePrefix = false;
		let i = 0;
		while (i < line.length) {
			const ch = line[i];
			if (ch !== "<") {
				if (!isIndentWs(ch)) hasRenderablePrefix = true;
				i++;
				continue;
			}
			const closeIdxRel = findTagCloseIndexOutsideQuotes$1(line.slice(i));
			if (closeIdxRel === -1) {
				hasRenderablePrefix = true;
				i++;
				continue;
			}
			const tagSlice = line.slice(i, i + closeIdxRel + 1);
			let cursor = 1;
			while (cursor < tagSlice.length && isIndentWs(tagSlice[cursor])) cursor++;
			if (cursor >= tagSlice.length) {
				hasRenderablePrefix = true;
				i++;
				continue;
			}
			const marker = tagSlice[cursor];
			if (marker === "!" || marker === "?") {
				hasRenderablePrefix = true;
				i += closeIdxRel + 1;
				continue;
			}
			if (marker === "/") {
				hasRenderablePrefix = true;
				i += closeIdxRel + 1;
				continue;
			}
			const nameStart = cursor;
			while (cursor < tagSlice.length && isNameChar(tagSlice[cursor])) cursor++;
			if (cursor === nameStart) {
				hasRenderablePrefix = true;
				i++;
				continue;
			}
			const tagName = tagSlice.slice(nameStart, cursor).toLowerCase();
			const boundary = tagSlice[cursor];
			if (boundary && boundary !== " " && boundary !== "	" && boundary !== ">" && boundary !== "/") {
				hasRenderablePrefix = true;
				i++;
				continue;
			}
			const sameLineCloseRe = new RegExp(String.raw`<\s*\/\s*${tagName}\s*>`, "i");
			const selfClosing = /\/\s*>$/.test(tagSlice);
			const closesOnSameLine = sameLineCloseRe.test(line.slice(i + closeIdxRel + 1));
			const closesLater = sameLineCloseRe.test(markdown.slice(lineStart + i + closeIdxRel + 1));
			const continuesOnLaterLine = /[\r\n]/.test(markdown.slice(lineStart + i + closeIdxRel + 1));
			if (hasRenderablePrefix && tagSet.has(tagName) && !selfClosing && !closesOnSameLine && (closesLater || continuesOnLaterLine)) return i;
			hasRenderablePrefix = true;
			i += closeIdxRel + 1;
		}
		return -1;
	};
	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;
	let out = "";
	let idx = 0;
	while (idx < markdown.length) {
		const nl = markdown.indexOf("\n", idx);
		const hasNl = nl !== -1;
		const isCrlf = hasNl && nl > idx && markdown[nl - 1] === "\r";
		const lineEnd = hasNl ? isCrlf ? nl - 1 : nl : markdown.length;
		const line = markdown.slice(idx, lineEnd);
		const newline$1 = hasNl ? isCrlf ? "\r\n" : "\n" : "";
		const fenceMatch = parseFenceMarker(line);
		let nextLine = line;
		if (!inFence && !fenceMatch) {
			const splitAt = findInlineCustomBlockSplitIndex(line, idx);
			if (splitAt !== -1) {
				const separator = newline$1 || "\n";
				nextLine = `${line.slice(0, splitAt).replace(/[ \t]+$/, "")}${separator}${separator}${line.slice(splitAt).replace(/^[ \t]+/, "")}`;
			}
		}
		out += nextLine;
		out += newline$1;
		if (fenceMatch) if (inFence) {
			if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
				if (/^\s*$/.test(fenceMatch.rest)) {
					inFence = false;
					fenceChar = "";
					fenceLen = 0;
				}
			}
		} else {
			inFence = true;
			fenceChar = fenceMatch.markerChar;
			fenceLen = fenceMatch.markerLen;
		}
		idx = hasNl ? nl + 1 : markdown.length;
	}
	return out;
}
function normalizeCustomHtmlOpeningTagSameLine(markdown, tags) {
	if (!markdown || !tags.length) return markdown;
	const tagSet = new Set(tags.map((t) => String(t ?? "").toLowerCase()));
	if (!tagSet.size) return markdown;
	const isIndentWs = (ch) => ch === " " || ch === "	";
	const isNameChar = (ch) => {
		const c = ch.charCodeAt(0);
		return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || ch === "_" || ch === "-";
	};
	const trimStartIndentWs = (s) => {
		let i = 0;
		while (i < s.length && isIndentWs(s[i])) i++;
		return s.slice(i);
	};
	const findTagCloseIndexOutsideQuotes$1 = (input) => {
		let inSingle = false;
		let inDouble = false;
		for (let i = 0; i < input.length; i++) {
			const ch = input[i];
			if (ch === "\\") {
				i++;
				continue;
			}
			if (!inDouble && ch === "'") {
				inSingle = !inSingle;
				continue;
			}
			if (!inSingle && ch === "\"") {
				inDouble = !inDouble;
				continue;
			}
			if (!inSingle && !inDouble && ch === ">") return i;
		}
		return -1;
	};
	const hasClosingTagOnLine = (line, from, tag) => {
		const lowerTag = tag.toLowerCase();
		let pos = line.indexOf("<", from);
		while (pos !== -1) {
			let i = pos + 1;
			while (i < line.length && isIndentWs(line[i])) i++;
			if (i >= line.length || line[i] !== "/") {
				pos = line.indexOf("<", pos + 1);
				continue;
			}
			i++;
			while (i < line.length && isIndentWs(line[i])) i++;
			if (i + lowerTag.length > line.length) {
				pos = line.indexOf("<", pos + 1);
				continue;
			}
			let matched = true;
			for (let j = 0; j < lowerTag.length; j++) {
				const ch = line[i + j];
				if ((ch >= "A" && ch <= "Z" ? String.fromCharCode(ch.charCodeAt(0) + 32) : ch) !== lowerTag[j]) {
					matched = false;
					break;
				}
			}
			if (!matched) {
				pos = line.indexOf("<", pos + 1);
				continue;
			}
			let k = i + lowerTag.length;
			if (k < line.length && isNameChar(line[k])) {
				pos = line.indexOf("<", pos + 1);
				continue;
			}
			while (k < line.length && isIndentWs(line[k])) k++;
			if (k < line.length && line[k] === ">") return true;
			pos = line.indexOf("<", pos + 1);
		}
		return false;
	};
	const normalizeLine = (line) => {
		let i = 0;
		while (i < line.length && isIndentWs(line[i])) i++;
		if (i >= line.length || line[i] !== "<") return line;
		i++;
		while (i < line.length && isIndentWs(line[i])) i++;
		if (i >= line.length || line[i] === "/") return line;
		const nameStart = i;
		while (i < line.length && isNameChar(line[i])) i++;
		if (i === nameStart) return line;
		const tagName = line.slice(nameStart, i).toLowerCase();
		if (!tagSet.has(tagName)) return line;
		const gtRel = findTagCloseIndexOutsideQuotes$1(line.slice(i));
		if (gtRel === -1) return line;
		const gt = i + gtRel;
		if (hasClosingTagOnLine(line, gt + 1, tagName)) return line;
		const rest = trimStartIndentWs(line.slice(gt + 1));
		if (!rest) return line;
		return `${line.slice(0, gt + 1)}\n${rest}`;
	};
	let out = "";
	let idx = 0;
	while (idx < markdown.length) {
		const nl = markdown.indexOf("\n", idx);
		if (nl === -1) {
			out += normalizeLine(markdown.slice(idx));
			break;
		}
		const isCrlf = nl > idx && markdown[nl - 1] === "\r";
		const lineEnd = isCrlf ? nl - 1 : nl;
		const line = markdown.slice(idx, lineEnd);
		out += normalizeLine(line);
		out += isCrlf ? "\r\n" : "\n";
		idx = nl + 1;
	}
	return out;
}
function ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(markdown, tags) {
	if (!markdown || !tags.length) return markdown;
	const tagSet = new Set(tags.map((t) => String(t ?? "").toLowerCase()));
	if (!tagSet.size) return markdown;
	const isIndentWs = (ch) => ch === " " || ch === "	";
	const parseBlockquotePrefix = (rawLine) => {
		let i = 0;
		let saw = false;
		let prefixEnd = 0;
		while (i < rawLine.length) {
			while (i < rawLine.length && isIndentWs(rawLine[i])) i++;
			if (i >= rawLine.length || rawLine[i] !== ">") break;
			saw = true;
			i++;
			while (i < rawLine.length && isIndentWs(rawLine[i])) i++;
			prefixEnd = i;
		}
		if (!saw) return null;
		return {
			prefix: rawLine.slice(0, prefixEnd),
			content: rawLine.slice(prefixEnd)
		};
	};
	const parseFenceMarker = (line) => {
		let i = 0;
		while (i < line.length && isIndentWs(line[i])) i++;
		const ch = line[i];
		if (ch !== "`" && ch !== "~") return null;
		let j = i;
		while (j < line.length && line[j] === ch) j++;
		const len = j - i;
		if (len < 3) return null;
		return {
			markerChar: ch,
			markerLen: len,
			rest: line.slice(j)
		};
	};
	const closeTagRes = Array.from(tagSet).map((tag) => {
		return new RegExp(String.raw`(<\s*\/\s*${tag}\s*>)${"(?=[\\t ]*(?:#{1,6}[\\t ]+|>|(?:[*+-]|\\d+[.)])[\\t ]+|(?:`{3,}|~{3,})|\\||\\$\\$|:{3,}|\\[\\^[^\\]]+\\]:|(?:-{3,}|\\*{3,}|_{3,})))"}`, "gi");
	});
	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;
	let out = "";
	let idx = 0;
	while (idx < markdown.length) {
		const nl = markdown.indexOf("\n", idx);
		const hasNl = nl !== -1;
		const isCrlf = hasNl && nl > idx && markdown[nl - 1] === "\r";
		const lineEnd = hasNl ? isCrlf ? nl - 1 : nl : markdown.length;
		const rawLine = markdown.slice(idx, lineEnd);
		const newline$1 = hasNl ? isCrlf ? "\r\n" : "\n" : "";
		const bq = parseBlockquotePrefix(rawLine);
		const prefix = bq?.prefix ?? "";
		const contentLine = bq?.content ?? rawLine;
		const fenceMatch = parseFenceMarker(contentLine);
		if (fenceMatch) if (inFence) {
			if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
				if (/^\s*$/.test(fenceMatch.rest)) {
					inFence = false;
					fenceChar = "";
					fenceLen = 0;
				}
			}
		} else {
			inFence = true;
			fenceChar = fenceMatch.markerChar;
			fenceLen = fenceMatch.markerLen;
		}
		let nextContent = contentLine;
		if (!inFence && nextContent.includes("</")) for (const re of closeTagRes) nextContent = nextContent.replace(re, (match, closeTag, offset, src) => {
			if (src.replace(/^[\t ]+/, "").startsWith("|")) return match;
			const before = src.slice(0, offset).replace(/^[\t ]+/, "");
			if (before.length > 0) {
				const closeTagName = closeTag.match(/^<\s*\/\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? "";
				const openTagName = before.match(/^<\s*([A-Z][\w:-]*)/i)?.[1]?.toLowerCase() ?? "";
				if (!closeTagName || !openTagName || closeTagName !== openTagName) return match;
			}
			return `${closeTag}\n\n`;
		});
		if (prefix) {
			const withPrefix = prefix + nextContent.split("\n").join(`\n${prefix}`);
			out += withPrefix;
		} else out += nextContent;
		out += newline$1;
		idx = hasNl ? nl + 1 : markdown.length;
	}
	return out;
}
function ensureBlankLineBeforeCustomHtmlBlocks(markdown, tags) {
	if (!markdown || !tags.length) return markdown;
	const tagSet = new Set(tags.map((t) => String(t ?? "").toLowerCase()));
	if (!tagSet.size) return markdown;
	const isIndentWs = (ch) => ch === " " || ch === "	";
	const isIndentedCodeLine = (line) => {
		if (!line) return false;
		if (line[0] === "	") return true;
		let spaces = 0;
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch === " ") {
				spaces++;
				if (spaces >= 4) return true;
				continue;
			}
			if (ch === "	") return true;
			break;
		}
		return false;
	};
	const isNameChar = (ch) => {
		const c = ch.charCodeAt(0);
		return c >= 65 && c <= 90 || c >= 97 && c <= 122 || c >= 48 && c <= 57 || ch === "_" || ch === "-" || ch === ":";
	};
	const trimStartIndentWs = (s) => {
		let i = 0;
		while (i < s.length && isIndentWs(s[i])) i++;
		return s.slice(i);
	};
	const parseBlockquotePrefix = (rawLine) => {
		let i = 0;
		let saw = false;
		let prefixEnd = 0;
		while (i < rawLine.length) {
			while (i < rawLine.length && isIndentWs(rawLine[i])) i++;
			if (i >= rawLine.length || rawLine[i] !== ">") break;
			saw = true;
			i++;
			while (i < rawLine.length && isIndentWs(rawLine[i])) i++;
			prefixEnd = i;
		}
		if (!saw) return null;
		const prefix = rawLine.slice(0, prefixEnd);
		return {
			prefix,
			key: prefix.replace(/[ \t]+$/, ""),
			content: rawLine.slice(prefixEnd)
		};
	};
	const previousLineLooksHtmlish = (line) => {
		return trimStartIndentWs(line).startsWith("<");
	};
	const lineIsBlank = (line) => {
		for (let i = 0; i < line.length; i++) {
			const ch = line[i];
			if (ch !== " " && ch !== "	") return false;
		}
		return true;
	};
	const parseOpeningCustomTagName = (line) => {
		if (isIndentedCodeLine(line)) return "";
		const trimmed = trimStartIndentWs(line);
		if (!trimmed.startsWith("<")) return "";
		let i = 1;
		while (i < trimmed.length && isIndentWs(trimmed[i])) i++;
		if (i >= trimmed.length) return "";
		if (trimmed[i] === "/" || trimmed[i] === "!" || trimmed[i] === "?") return "";
		const nameStart = i;
		while (i < trimmed.length && isNameChar(trimmed[i])) i++;
		if (i === nameStart) return "";
		const name = trimmed.slice(nameStart, i).toLowerCase();
		if (!tagSet.has(name)) return "";
		const next = trimmed[i];
		if (next && next !== " " && next !== "	" && next !== ">" && next !== "/") return "";
		return name;
	};
	const parseLineStartCustomTag = (line) => {
		if (isIndentedCodeLine(line)) return null;
		const trimmed = trimStartIndentWs(line);
		if (!trimmed.startsWith("<")) return null;
		let i = 1;
		while (i < trimmed.length && isIndentWs(trimmed[i])) i++;
		if (i >= trimmed.length) return null;
		const isClose = trimmed[i] === "/";
		if (isClose) {
			i++;
			while (i < trimmed.length && isIndentWs(trimmed[i])) i++;
		}
		const next = trimmed[i];
		if (!next || next === "!" || next === "?") return null;
		const nameStart = i;
		while (i < trimmed.length && isNameChar(trimmed[i])) i++;
		if (i === nameStart) return null;
		const name = trimmed.slice(nameStart, i).toLowerCase();
		if (!tagSet.has(name)) return null;
		const boundary = trimmed[i];
		if (boundary && boundary !== " " && boundary !== "	" && boundary !== ">" && boundary !== "/") return null;
		if (isClose) return {
			type: "close",
			name
		};
		if (/\/\s*>\s*$/.test(trimmed)) return {
			type: "open",
			name,
			complete: true
		};
		const gt = trimmed.indexOf(">", i);
		if (gt !== -1) {
			const after = trimmed.slice(gt + 1);
			if (new RegExp(`<\\s*\\/\\s*${name}\\s*>`, "i").test(after)) return {
				type: "open",
				name,
				complete: true
			};
		}
		return {
			type: "open",
			name,
			complete: false
		};
	};
	const parseStandaloneCompleteHtmlTagLine = (line) => {
		if (isIndentedCodeLine(line)) return null;
		const trimmed = trimStartIndentWs(line).replace(/[ \t]+$/, "");
		if (!trimmed.startsWith("<")) return null;
		if (/^<\s*(?:!--|!doctype\b|\?)/i.test(trimmed)) return null;
		const selfClosingMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*\/\s*>\s*$/i);
		if (selfClosingMatch?.[1]) return selfClosingMatch[1].toLowerCase();
		const fullMatch = trimmed.match(/^<\s*([A-Z][\w:-]*)\b[^>]*>[\s\S]*<\s*\/\s*([A-Z][\w:-]*)\s*>\s*$/i);
		if (!fullMatch?.[1] || !fullMatch[2]) return null;
		const openTag = fullMatch[1].toLowerCase();
		return openTag === fullMatch[2].toLowerCase() ? openTag : null;
	};
	let inFence = false;
	let fenceChar = "";
	let fenceLen = 0;
	const parseFenceMarker = (line) => {
		let i = 0;
		while (i < line.length && isIndentWs(line[i])) i++;
		const ch = line[i];
		if (ch !== "`" && ch !== "~") return null;
		let j = i;
		while (j < line.length && line[j] === ch) j++;
		const len = j - i;
		if (len < 3) return null;
		return {
			markerChar: ch,
			markerLen: len,
			rest: line.slice(j)
		};
	};
	const fenceMatchLine = (rawLine) => parseFenceMarker(rawLine);
	const lineStartsWithBlockMarker = (line) => {
		const trimmed = trimStartIndentWs(line);
		if (!trimmed) return false;
		if (isIndentedCodeLine(line)) return true;
		return /^(?:#{1,6}[ \t]+|>|[*+-][ \t]+|\d+[.)][ \t]+|`{3,}|~{3,}|\||\$\$|:{3,}|\[\^[^\]]+\]:|-{3,}|\*{3,}|_{3,})/.test(trimmed);
	};
	const currentCustomBlockNeedsBoundary = (lineStart, currentQuoteKey, tagName) => {
		let scanIdx = lineStart;
		let depth = 0;
		while (scanIdx < markdown.length) {
			const nl = markdown.indexOf("\n", scanIdx);
			const hasNl = nl !== -1;
			const isCrlf = hasNl && nl > scanIdx && markdown[nl - 1] === "\r";
			const lineEnd = hasNl ? isCrlf ? nl - 1 : nl : markdown.length;
			const rawLine = markdown.slice(scanIdx, lineEnd);
			const blockquote$1 = parseBlockquotePrefix(rawLine);
			const quoteKey = blockquote$1?.key ?? "";
			if (depth > 0 && currentQuoteKey && quoteKey !== currentQuoteKey) break;
			const contentLine = blockquote$1?.content ?? rawLine;
			const lineTag = parseLineStartCustomTag(contentLine);
			if (lineTag?.name === tagName) {
				if (lineTag.type === "open") {
					if (!lineTag.complete) depth++;
				} else if (depth > 0) {
					depth--;
					if (depth === 0) return false;
				}
			} else if (depth > 0) {
				if (lineIsBlank(contentLine) || lineStartsWithBlockMarker(contentLine)) return true;
			}
			if (hasNl) scanIdx = nl + 1;
			else break;
		}
		return false;
	};
	let out = "";
	let idx = 0;
	let prevLineBlank = true;
	let prevLineHtmlish = false;
	let prevLineStandaloneCompleteHtmlTag = false;
	let lastNewline = "\n";
	const customBlockStack = [];
	let prevQuoteKey = "";
	while (idx < markdown.length) {
		const nl = markdown.indexOf("\n", idx);
		const hasNl = nl !== -1;
		const isCrlf = hasNl && nl > idx && markdown[nl - 1] === "\r";
		const lineEnd = hasNl ? isCrlf ? nl - 1 : nl : markdown.length;
		const line = markdown.slice(idx, lineEnd);
		const newline$1 = hasNl ? isCrlf ? "\r\n" : "\n" : "";
		const blockquote$1 = parseBlockquotePrefix(line);
		const quoteKey = blockquote$1?.key ?? "";
		const contentLine = blockquote$1?.content ?? line;
		const fenceMatch = fenceMatchLine(contentLine);
		if (fenceMatch) if (inFence) {
			if (fenceMatch.markerChar === fenceChar && fenceMatch.markerLen >= fenceLen) {
				if (/^\s*$/.test(fenceMatch.rest)) {
					inFence = false;
					fenceChar = "";
					fenceLen = 0;
				}
			}
		} else {
			inFence = true;
			fenceChar = fenceMatch.markerChar;
			fenceLen = fenceMatch.markerLen;
		}
		const insideCustomBlock = customBlockStack.length > 0;
		if (!inFence && !insideCustomBlock) {
			const opening = parseOpeningCustomTagName(contentLine);
			const needsBoundaryAfterStandaloneHtml = !!opening && !prevLineBlank && prevLineHtmlish && prevLineStandaloneCompleteHtmlTag && currentCustomBlockNeedsBoundary(idx, quoteKey, opening);
			if (opening && !prevLineBlank && (!prevLineHtmlish || needsBoundaryAfterStandaloneHtml)) {
				if (quoteKey && prevQuoteKey && quoteKey === prevQuoteKey) out += `${quoteKey}${lastNewline}`;
				else if (!quoteKey) out += lastNewline;
			}
		}
		out += line;
		out += newline$1;
		if (newline$1) lastNewline = newline$1;
		if (!inFence) {
			const tag = parseLineStartCustomTag(contentLine);
			if (tag) {
				if (tag.type === "open") {
					if (!tag.complete) customBlockStack.push(tag.name);
				} else for (let j = customBlockStack.length - 1; j >= 0; j--) if (customBlockStack[j] === tag.name) {
					customBlockStack.length = j;
					break;
				}
			}
		}
		const blank = lineIsBlank(contentLine);
		prevLineBlank = blank;
		prevLineHtmlish = !blank && previousLineLooksHtmlish(contentLine);
		prevLineStandaloneCompleteHtmlTag = !blank && !!parseStandaloneCompleteHtmlTagLine(contentLine);
		prevQuoteKey = quoteKey;
		idx = hasNl ? nl + 1 : markdown.length;
	}
	return out;
}
function parseMarkdownToStructure(markdown, md, options = {}) {
	const timing = getParseTiming(options);
	const parseStartedAt = timing ? getParserNow() : 0;
	const isFinal = !!options.final;
	let safeMarkdown = (markdown ?? "").toString().replace(/([^\\])\r(ight|ho)/g, "$1\\r$2").replace(/([^\\])\n(abla|eq|ot|exists)/g, "$1\\n$2");
	if (shouldResetTopLevelStreamCacheForFinalAutoParse(md, options)) {
		md.stream.reset();
		clearTolerantMathBoundaryStreamCache(md);
	}
	if (!isFinal) {
		if (safeMarkdown.endsWith("- *")) safeMarkdown = safeMarkdown.replace(/- \*$/, "- \\*");
		if (/(?:^|\n)\s*-\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*-\s*$/, (m) => {
			return m.startsWith("\n") ? "\n" : "";
		});
		else if (/(?:^|\n)\s*--\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*--\s*$/, (m) => {
			return m.startsWith("\n") ? "\n" : "";
		});
		else if (/(?:^|\n)\s*>\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*>\s*$/, (m) => {
			return m.startsWith("\n") ? "\n" : "";
		});
		else if (/\n\s*[*+]\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/\n\s*[*+]\s*$/, "\n");
		else if (/(?:^|\n)\s*\d+\s*$/.test(safeMarkdown)) {
			if (!/^\d+$/.test(safeMarkdown.trim())) safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+\s*$/, (m) => {
				return m.startsWith("\n") ? "\n" : "";
			});
		} else if (/(?:^|\n)\s*\d+[.)]\s+\*{1,3}\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/((?:^|\n)\s*\d+[.)]\s+)(\*{1,3})\s*$/, (_, prefix, stars) => `${prefix}${stars.split("").map(() => "\\*").join("")}`);
		else if (/(?:^|\n)\s*\d+[.)]\s*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/(?:^|\n)\s*\d+[.)]\s*$/, (m) => {
			return m.startsWith("\n") ? "\n" : "";
		});
		else if (/\n[[(]\n*$/.test(safeMarkdown)) safeMarkdown = safeMarkdown.replace(/(\n\[|\n\()+\n*$/g, "\n");
	}
	if (options.customHtmlTags?.length && safeMarkdown.includes("<")) {
		const tags = normalizeCustomHtmlTags(options.customHtmlTags);
		if (tags.length) {
			safeMarkdown = ensureBlankLineBeforeInlineMultilineCustomHtmlBlocks(safeMarkdown, tags);
			safeMarkdown = normalizeCustomHtmlOpeningTagSameLine(safeMarkdown, tags);
			safeMarkdown = ensureBlankLineBeforeCustomHtmlBlocks(safeMarkdown, tags);
			safeMarkdown = ensureBlankLineAfterCustomHtmlCloseBeforeBlockMarkerSameLine(safeMarkdown, tags);
			if (!safeMarkdown.includes("</")) {} else for (const tag of tags) {
				const re = new RegExp(String.raw`(^[\t ]*<\s*\/\s*${tag}\s*>[\t ]*)(\r?\n)(?![\t ]*\r?\n|$)`, "gim");
				safeMarkdown = safeMarkdown.replace(re, "$1$2$2");
			}
		}
	}
	if (!isFinal) safeMarkdown = stripDanglingHtmlLikeTail(safeMarkdown);
	const standaloneHtmlDocument = parseStandaloneHtmlDocument(safeMarkdown);
	if (standaloneHtmlDocument) {
		const preHook = options.preTransformTokens;
		const postHook = options.postTransformTokens;
		if (shouldUseTopLevelStreamParse(md, options) || typeof preHook === "function" || typeof postHook === "function") {
			const rawTokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options);
			const hookedTokens = typeof preHook === "function" ? preHook(rawTokens) || rawTokens : rawTokens;
			if (typeof postHook === "function") postHook(hookedTokens);
		}
		return finishTimedParse(standaloneHtmlDocument, timing, parseStartedAt);
	}
	const tokens = parseTopLevelTokens(md, safeMarkdown, { __markstreamFinal: isFinal }, options);
	if (!tokens || !Array.isArray(tokens)) return finishTimedParse([], timing, parseStartedAt);
	const pre = options.preTransformTokens;
	const post = options.postTransformTokens;
	let transformedTokens = tokens;
	if (pre && typeof pre === "function") transformedTokens = pre(transformedTokens) || transformedTokens;
	const mdAny = md;
	const validateLink$1 = options.validateLink ?? mdAny.options?.validateLink ?? (typeof mdAny.validateLink === "function" ? mdAny.validateLink : void 0);
	const internalOptions = {
		...options,
		validateLink: validateLink$1,
		__markdownIt: md,
		__sourceMarkdown: safeMarkdown,
		__customHtmlBlockCursor: 0
	};
	let result = processTokensWithTiming(transformedTokens, internalOptions, timing);
	if (post && typeof post === "function") {
		const postResult = post(transformedTokens);
		if (Array.isArray(postResult)) {
			const first = postResult[0];
			const firstType = first?.type;
			if (first && typeof firstType === "string") result = processTokensWithTiming(postResult, void 0, timing);
			else result = postResult;
		}
	}
	result = mergeSplitTopLevelHtmlBlocks(result, isFinal, safeMarkdown);
	result = combineStructuredDetailsHtmlBlocks(result, safeMarkdown, md, options, isFinal)[0];
	result = structureGenericHtmlBlockChildren(result, md, options, isFinal);
	if (isFinal) {
		const seen = /* @__PURE__ */ new WeakSet();
		const finalizeHtmlBlockLoading = (value) => {
			if (!value || typeof value !== "object") return;
			if (seen.has(value)) return;
			seen.add(value);
			if (Array.isArray(value)) {
				for (const item of value) finalizeHtmlBlockLoading(item);
				return;
			}
			const node = value;
			if (node.type === "html_block" && node.loading === true) node.loading = false;
			for (const child of Object.values(node)) finalizeHtmlBlockLoading(child);
		};
		finalizeHtmlBlockLoading(result);
	}
	if (options.debug) console.log("Parsed Markdown Tree Structure:", result);
	return finishTimedParse(result, timing, parseStartedAt);
}
function processTokens(tokens, options) {
	if (!tokens || !Array.isArray(tokens)) return [];
	const result = [];
	const linkifyContext = createLinkifyDemotionContextTracker(options);
	let i = 0;
	while (i < tokens.length) {
		const handled = parseCommonBlockToken(tokens, i, linkifyContext.options(), containerTokenHandlers);
		if (handled) {
			result.push(handled[0]);
			linkifyContext.remember(handled[0].raw);
			i = handled[1];
			continue;
		}
		const token = tokens[i];
		switch (token.type) {
			case "paragraph_open": {
				const paragraphRaw = String(tokens[i + 1]?.content ?? "");
				const paragraphNode = parseParagraph(tokens, i, linkifyContext.options(paragraphRaw));
				const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options);
				if (promoted) result.push(...promoted);
				else result.push(paragraphNode);
				linkifyContext.remember(paragraphNode.raw);
				i += 3;
				break;
			}
			case "bullet_list_open":
			case "ordered_list_open": {
				const [listNode, newIndex] = parseList(tokens, i, linkifyContext.options());
				result.push(listNode);
				linkifyContext.remember(listNode.raw);
				i = newIndex;
				break;
			}
			case "blockquote_open": {
				const [blockquoteNode, newIndex] = parseBlockquote(tokens, i, linkifyContext.options());
				result.push(blockquoteNode);
				linkifyContext.remember(blockquoteNode.raw);
				i = newIndex;
				break;
			}
			case "footnote_anchor": {
				const meta = token.meta ?? {};
				const id = String(meta.label ?? token.content ?? "");
				result.push({
					type: "footnote_anchor",
					id,
					raw: String(token.content ?? "")
				});
				linkifyContext.remember(String(token.content ?? ""));
				i++;
				break;
			}
			case "hardbreak":
				result.push(parseHardBreak());
				linkifyContext.reset();
				i++;
				break;
			case "text": {
				const content = String(token.content ?? "");
				result.push({
					type: "paragraph",
					raw: content,
					children: content ? [{
						type: "text",
						content,
						raw: content
					}] : []
				});
				linkifyContext.remember(content);
				i++;
				break;
			}
			case "inline":
				{
					const raw = String(token.content ?? "");
					const parsed = parseInlineTokens(token.children || [], raw, void 0, linkifyContext.options(raw));
					if (parsed.length === 0) {} else if (parsed.every((n) => n.type === "html_block")) result.push(...parsed);
					else {
						const paragraphNode = {
							type: "paragraph",
							raw,
							children: parsed
						};
						const promoted = maybePromoteCustomNodeFromParagraph(paragraphNode, options);
						if (promoted) result.push(...promoted);
						else result.push(paragraphNode);
					}
					linkifyContext.remember(raw);
				}
				i += 1;
				break;
			default:
				i += 1;
				break;
		}
	}
	return result;
}

//#endregion
//#region src/htmlRenderUtils.ts
const SAFE_BLOCKED_HTML_TAGS = new Set([
	...BLOCKED_HTML_TAGS,
	"base",
	"button",
	"datalist",
	"dialog",
	"embed",
	"fieldset",
	"form",
	"iframe",
	"input",
	"legend",
	"link",
	"meta",
	"object",
	"optgroup",
	"option",
	"output",
	"param",
	"select",
	"style",
	"template",
	"textarea",
	"title"
]);
const SAFE_ALLOWED_HTML_TAGS = new Set([
	"a",
	"abbr",
	"b",
	"blockquote",
	"br",
	"caption",
	"code",
	"col",
	"colgroup",
	"dd",
	"details",
	"div",
	"dl",
	"dt",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"img",
	"ins",
	"kbd",
	"li",
	"mark",
	"ol",
	"p",
	"pre",
	"s",
	"small",
	"span",
	"strong",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"ul"
]);
const CUSTOM_TAG_REGEX = /<([a-z][a-z0-9-]*)\b[^>]*>/gi;
function hasOwn(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key);
}
function getString(value) {
	return typeof value === "string" ? value : value == null ? "" : String(value);
}
function isSafeAttrName(value) {
	return /^[^\s"'<>`=]+$/.test(value) && !/^on/i.test(value);
}
function escapeHtml$1(value) {
	return getString(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(value) {
	return escapeHtml$1(value).replace(/`/g, "&#96;");
}
function normalizeTagName(tagName) {
	return String(tagName ?? "").trim().toLowerCase();
}
function isHtmlTagBlocked(tagName, policy = "safe") {
	const normalized = normalizeTagName(tagName);
	if (!normalized) return false;
	if (policy === "escape") return true;
	if (policy === "trusted") return BLOCKED_HTML_TAGS.has(normalized);
	return !SAFE_ALLOWED_HTML_TAGS.has(normalized);
}
function isHtmlTagHardBlocked(tagName, policy = "safe") {
	const normalized = normalizeTagName(tagName);
	if (!normalized) return false;
	if (policy === "escape") return true;
	if (policy === "trusted") return BLOCKED_HTML_TAGS.has(normalized);
	return SAFE_BLOCKED_HTML_TAGS.has(normalized);
}
function serializeAttrs(attrs) {
	const pairs = Object.entries(attrs);
	if (pairs.length === 0) return "";
	return pairs.map(([name, value]) => value === "" ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`).join("");
}
function isUnsafeSrcset(value, tagName) {
	const candidates = value.split(",").map((candidate) => candidate.trim()).filter(Boolean);
	if (candidates.length === 0) return false;
	return candidates.some((candidate) => {
		const url = candidate.split(/\s+/, 1)[0] ?? "";
		return !url || isUnsafeHtmlUrl(url, {
			tagName,
			attrName: "srcset"
		});
	});
}
function shouldDropHtmlAttr(lowerKey, value, policy, tagName) {
	if (DANGEROUS_HTML_ATTRS.has(lowerKey)) return true;
	if (policy === "safe" && lowerKey === "style") return true;
	if (lowerKey === "srcset") return isUnsafeSrcset(value, tagName);
	if (URL_HTML_ATTRS.has(lowerKey) && value && isUnsafeHtmlUrl(value, {
		tagName,
		attrName: lowerKey
	})) return true;
	return false;
}
function findHtmlAttrName(attrs, attrName) {
	const normalized = attrName.toLowerCase();
	return Object.keys(attrs).find((key) => key.toLowerCase() === normalized);
}
function hardenAnchorAttrs(clean, policy, tagName, hadHref = false) {
	if (policy !== "safe" || normalizeTagName(tagName) !== "a") return clean;
	const hrefKey = findHtmlAttrName(clean, "href");
	if (hadHref && (!hrefKey || !clean[hrefKey])) {
		const targetKey$1 = findHtmlAttrName(clean, "target");
		const relKey$1 = findHtmlAttrName(clean, "rel");
		if (targetKey$1) delete clean[targetKey$1];
		if (relKey$1) delete clean[relKey$1];
		return clean;
	}
	const targetKey = findHtmlAttrName(clean, "target");
	if ((targetKey ? String(clean[targetKey]).trim() : "").toLowerCase() !== "_blank") return clean;
	const relKey = findHtmlAttrName(clean, "rel");
	const relTokens = new Set(String(relKey ? clean[relKey] : "").split(/\s+/).map((token) => token.trim()).filter(Boolean).filter((token) => token.toLowerCase() !== "opener"));
	relTokens.add("noopener");
	relTokens.add("noreferrer");
	if (relKey && relKey !== "rel") delete clean[relKey];
	clean.rel = Array.from(relTokens).join(" ");
	return clean;
}
function sanitizeHtmlContentAttrs(attrs, policy = "safe", tagName) {
	const clean = {};
	for (const [key, value] of Object.entries(attrs)) {
		const safeName = key.trim();
		const lowerKey = safeName.toLowerCase();
		if (!safeName || !isSafeAttrName(safeName)) continue;
		if (shouldDropHtmlAttr(lowerKey, value, policy, tagName)) continue;
		clean[safeName] = value;
	}
	return hardenAnchorAttrs(clean, policy, tagName, Boolean(findHtmlAttrName(attrs, "href")));
}
function isCustomHtmlComponentTag(tagName, customComponents) {
	const lowerTag = tagName.toLowerCase();
	if (EXTENDED_STANDARD_HTML_TAGS.has(lowerTag)) return false;
	return hasOwn(customComponents, lowerTag) || hasOwn(customComponents, tagName);
}
function sanitizeHtmlAttrs(attrs, policy = "safe", tagName) {
	const clean = {};
	for (const [key, value] of Object.entries(attrs)) {
		const safeName = key.trim();
		const lowerKey = safeName.toLowerCase();
		if (!safeName || !isSafeAttrName(safeName)) continue;
		if (shouldDropHtmlAttr(lowerKey, value, policy, tagName)) continue;
		clean[safeName] = value;
	}
	return hardenAnchorAttrs(clean, policy, tagName, Boolean(findHtmlAttrName(attrs, "href")));
}
function tokenAttrsToRecord(attrs) {
	const record = {};
	if (!Array.isArray(attrs) || attrs.length === 0) return record;
	for (const [key, value] of attrs) {
		if (!key) continue;
		record[String(key)] = value == null ? "" : String(value);
	}
	return record;
}
function sanitizeHtmlTokenAttrs(attrs, policy = "safe", tagName) {
	const sanitized = sanitizeHtmlAttrs(tokenAttrsToRecord(attrs), policy, tagName);
	const pairs = Object.entries(sanitized).map(([key, value]) => [key, value]);
	return pairs.length > 0 ? pairs : void 0;
}
function convertHtmlPropValue(value, key) {
	const lowerKey = key.toLowerCase();
	if ([
		"checked",
		"disabled",
		"readonly",
		"required",
		"autofocus",
		"multiple",
		"hidden"
	].includes(lowerKey)) return value === "true" || value === "" || value === key;
	if ([
		"value",
		"min",
		"max",
		"step",
		"width",
		"height",
		"size",
		"maxlength"
	].includes(lowerKey)) {
		const num = Number(value);
		if (value !== "" && !Number.isNaN(num)) return num;
	}
	return value;
}
function convertHtmlAttrsToProps(attrs) {
	const result = {};
	for (const [key, value] of Object.entries(attrs)) result[key] = convertHtmlPropValue(value, key);
	return result;
}
function isMeaningfulText(text$1) {
	return text$1.trim().length > 0;
}
function tokenizeHtml(html) {
	const tokens = [];
	let pos = 0;
	while (pos < html.length) {
		if (html.startsWith("<!--", pos)) {
			const commentEnd = html.indexOf("-->", pos);
			if (commentEnd !== -1) {
				pos = commentEnd + 3;
				continue;
			}
			break;
		}
		const tagStart = html.indexOf("<", pos);
		if (tagStart === -1) {
			if (pos < html.length) {
				const remainingText = html.slice(pos);
				if (isMeaningfulText(remainingText)) tokens.push({
					type: "text",
					content: remainingText
				});
			}
			break;
		}
		if (tagStart > pos) {
			const textContent = html.slice(pos, tagStart);
			if (isMeaningfulText(textContent)) tokens.push({
				type: "text",
				content: textContent
			});
		}
		if (html.startsWith("![CDATA[", tagStart + 1)) {
			const cdataEnd = html.indexOf("]]>", tagStart);
			if (cdataEnd !== -1) {
				tokens.push({
					type: "text",
					content: html.slice(tagStart, cdataEnd + 3)
				});
				pos = cdataEnd + 3;
				continue;
			}
			break;
		}
		if (html.startsWith("!", tagStart + 1)) {
			const specialEnd = html.indexOf(">", tagStart);
			if (specialEnd !== -1) {
				pos = specialEnd + 1;
				continue;
			}
			break;
		}
		const tagEnd = html.indexOf(">", tagStart);
		if (tagEnd === -1) break;
		const tagContent = html.slice(tagStart + 1, tagEnd).trim();
		const isClosingTag$1 = tagContent.startsWith("/");
		const isSelfClosing$1 = tagContent.endsWith("/");
		if (isClosingTag$1) {
			const tagName = tagContent.slice(1).trim();
			tokens.push({
				type: "tag_close",
				tagName
			});
		} else {
			const spaceIndex = tagContent.indexOf(" ");
			let tagName;
			let attrsStr = "";
			if (spaceIndex === -1) tagName = isSelfClosing$1 ? tagContent.slice(0, -1).trim() : tagContent.trim();
			else {
				tagName = tagContent.slice(0, spaceIndex).trim();
				attrsStr = tagContent.slice(spaceIndex + 1);
			}
			const attrs = {};
			if (attrsStr) {
				const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g;
				let attrMatch;
				while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
					const name = attrMatch[1];
					const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
					if (name && !name.endsWith("/")) attrs[name] = value;
				}
			}
			tokens.push({
				type: isSelfClosing$1 || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? "self_closing" : "tag_open",
				tagName,
				attrs
			});
		}
		pos = tagEnd + 1;
	}
	return tokens;
}
function tokenizeHtmlPreservingText(html) {
	const tokens = [];
	let pos = 0;
	while (pos < html.length) {
		if (html.startsWith("<!--", pos)) {
			const commentEnd = html.indexOf("-->", pos);
			if (commentEnd !== -1) {
				pos = commentEnd + 3;
				continue;
			}
			break;
		}
		const tagStart = html.indexOf("<", pos);
		if (tagStart === -1) {
			if (pos < html.length) tokens.push({
				type: "text",
				content: html.slice(pos)
			});
			break;
		}
		if (tagStart > pos) tokens.push({
			type: "text",
			content: html.slice(pos, tagStart)
		});
		if (html.startsWith("![CDATA[", tagStart + 1)) {
			const cdataEnd = html.indexOf("]]>", tagStart);
			if (cdataEnd !== -1) {
				tokens.push({
					type: "text",
					content: html.slice(tagStart, cdataEnd + 3)
				});
				pos = cdataEnd + 3;
				continue;
			}
			break;
		}
		if (html.startsWith("!", tagStart + 1)) {
			const specialEnd = html.indexOf(">", tagStart);
			if (specialEnd !== -1) {
				pos = specialEnd + 1;
				continue;
			}
			break;
		}
		const tagEnd = html.indexOf(">", tagStart);
		if (tagEnd === -1) break;
		const tagContent = html.slice(tagStart + 1, tagEnd).trim();
		if (!tagContent) {
			pos = tagEnd + 1;
			continue;
		}
		const isClosingTag$1 = tagContent.startsWith("/");
		const isSelfClosing$1 = tagContent.endsWith("/");
		if (isClosingTag$1) {
			const tagName$1 = tagContent.slice(1).trim();
			tokens.push({
				type: "tag_close",
				tagName: tagName$1
			});
			pos = tagEnd + 1;
			continue;
		}
		const spaceIndex = tagContent.indexOf(" ");
		let tagName = "";
		let attrsStr = "";
		if (spaceIndex === -1) tagName = isSelfClosing$1 ? tagContent.slice(0, -1).trim() : tagContent.trim();
		else {
			tagName = tagContent.slice(0, spaceIndex).trim();
			attrsStr = tagContent.slice(spaceIndex + 1);
		}
		const attrs = {};
		if (attrsStr) {
			const attrRegex = /([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S*)))?/g;
			let attrMatch;
			while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
				const name = attrMatch[1];
				const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
				if (name && !name.endsWith("/")) attrs[name] = value;
			}
		}
		tokens.push({
			type: isSelfClosing$1 || VOID_HTML_TAGS.has(tagName.toLowerCase()) ? "self_closing" : "tag_open",
			tagName,
			attrs
		});
		pos = tagEnd + 1;
	}
	return tokens;
}
function serializeLiteralHtmlTag(token) {
	const tagName = String(token.tagName ?? "").trim();
	if (!tagName) return "";
	if (token.type === "tag_close") return `&lt;/${escapeHtml$1(tagName)}&gt;`;
	const attrs = Object.entries(token.attrs ?? {}).map(([name, value]) => value === "" ? ` ${escapeHtml$1(name)}` : ` ${escapeHtml$1(name)}="${escapeAttr(value)}"`).join("");
	return token.type === "self_closing" ? `&lt;${escapeHtml$1(tagName)}${attrs} /&gt;` : `&lt;${escapeHtml$1(tagName)}${attrs}&gt;`;
}
function hasCustomHtmlComponents(content, customComponents) {
	if (!content || !content.includes("<")) return false;
	if (!customComponents || Object.keys(customComponents).length === 0) return false;
	CUSTOM_TAG_REGEX.lastIndex = 0;
	let match;
	while ((match = CUSTOM_TAG_REGEX.exec(content)) !== null) if (isCustomHtmlComponentTag(match[1], customComponents)) return true;
	return false;
}
function sanitizeHtmlContent(content, policy = "safe") {
	if (!content) return "";
	if (policy === "escape") return escapeHtml$1(content);
	const tokens = tokenizeHtmlPreservingText(content);
	const stack = [];
	const output = [];
	const blockedStack = [];
	for (const token of tokens) {
		if (token.type === "text") {
			if (blockedStack.length === 0) output.push(escapeHtml$1(token.content ?? ""));
			continue;
		}
		const tagName = normalizeTagName(token.tagName);
		if (!tagName) continue;
		if (isHtmlTagHardBlocked(tagName, policy)) {
			if (token.type === "tag_open") blockedStack.push(tagName);
			else if (token.type === "tag_close" && blockedStack[blockedStack.length - 1] === tagName) blockedStack.pop();
			continue;
		}
		if (blockedStack.length > 0) continue;
		if (policy === "safe" && isHtmlTagBlocked(tagName, policy)) {
			output.push(serializeLiteralHtmlTag(token));
			continue;
		}
		if (token.type === "self_closing") {
			output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}, policy, tagName))}>`);
			continue;
		}
		if (token.type === "tag_open") {
			output.push(`<${tagName}${serializeAttrs(sanitizeHtmlContentAttrs(token.attrs ?? {}, policy, tagName))}>`);
			if (!VOID_HTML_TAGS.has(tagName)) stack.push(tagName);
			continue;
		}
		const matchedIndex = stack.lastIndexOf(tagName);
		if (matchedIndex === -1) continue;
		while (stack.length > matchedIndex + 1) {
			const danglingTag = stack.pop();
			if (danglingTag) output.push(`</${danglingTag}>`);
		}
		const closingTag = stack.pop();
		if (closingTag) output.push(`</${closingTag}>`);
	}
	while (stack.length > 0) {
		const danglingTag = stack.pop();
		if (danglingTag) output.push(`</${danglingTag}>`);
	}
	return output.join("");
}

//#endregion
//#region src/mermaidSvgSanitizer.ts
const DISALLOWED_STYLE_PATTERNS = [
	/javascript:/i,
	/vbscript:/i,
	/data:text\/html/i,
	/expression\s*\(/i,
	/@import/i
];
const SVG_NS = "http://www.w3.org/2000/svg";
const FOREIGN_OBJECT_IGNORED_TAGS = new Set([
	"script",
	"style",
	"iframe",
	"object",
	"embed",
	"link",
	"meta"
]);
const ALLOWED_SVG_TAGS = new Set([
	"svg",
	"style",
	"g",
	"a",
	"defs",
	"marker",
	"path",
	"rect",
	"circle",
	"ellipse",
	"line",
	"polyline",
	"polygon",
	"text",
	"tspan",
	"title",
	"desc",
	"use",
	"image",
	"lineargradient",
	"radialgradient",
	"stop",
	"clippath",
	"mask",
	"pattern"
]);
const URL_LIKE_SVG_ATTRS = new Set([
	"href",
	"xlink:href",
	"src",
	"srcdoc",
	"action",
	"data",
	"formaction",
	"poster"
]);
const URL_REFERENCE_SVG_ATTRS = new Set([
	"clip-path",
	"fill",
	"filter",
	"marker-end",
	"marker-mid",
	"marker-start",
	"mask",
	"stroke"
]);
const RENDERABLE_SVG_TAGS = new Set([
	"circle",
	"ellipse",
	"image",
	"line",
	"path",
	"polygon",
	"polyline",
	"rect",
	"text",
	"tspan",
	"use"
]);
function hasSafeSvgHref(node) {
	return (node.getAttribute("href") || node.getAttribute("xlink:href"))?.startsWith("#") === true;
}
function hasImageSource(node) {
	return Boolean(node.getAttribute("href") || node.getAttribute("xlink:href") || node.getAttribute("src"));
}
function isRenderableSvgNode(node) {
	const tag = node.nodeName.toLowerCase();
	if (tag === "use") return hasSafeSvgHref(node);
	if (tag === "image") return hasImageSource(node);
	if (tag === "text" || tag === "tspan") return Boolean(node.textContent?.trim());
	return RENDERABLE_SVG_TAGS.has(tag);
}
function neutralizeScriptProtocols(raw) {
	return raw.replace(/(["'])\s*javascript:/gi, "$1#").replace(/\bjavascript:/gi, "#").replace(/(["'])\s*vbscript:/gi, "$1#").replace(/\bvbscript:/gi, "#").replace(/\bdata:text\/html/gi, "#");
}
function sanitizeSvgUrl(tagName, attrName, value) {
	const tag = tagName.toLowerCase();
	const attr = attrName.toLowerCase();
	const url = String(value ?? "").trim();
	if (!url) return "";
	if ((tag === "use" || tag === "marker" || tag === "clippath" || tag === "mask") && (attr === "href" || attr === "xlink:href")) return url.startsWith("#") ? url : "";
	if (tag === "a" && (attr === "href" || attr === "xlink:href")) return isUnsafeHtmlUrl(url, {
		tagName: "a",
		attrName: "href"
	}) ? "" : url;
	if (tag === "image" && (attr === "href" || attr === "xlink:href" || attr === "src")) return isUnsafeHtmlUrl(url, {
		tagName: "img",
		attrName: "src"
	}) ? "" : url;
	if (attr === "href" || attr === "xlink:href") return url.startsWith("#") ? url : "";
	return isUnsafeHtmlUrl(url, {
		tagName: tag,
		attrName: attr
	}) ? "" : url;
}
function readCssUrl(value, start) {
	let pos = start + 4;
	while (pos < value.length && /\s/.test(value[pos] ?? "")) pos++;
	const quote = value[pos];
	if (quote === "\"" || quote === "'") {
		const urlStart$1 = pos + 1;
		const urlEnd = value.indexOf(quote, urlStart$1);
		if (urlEnd === -1) return {
			next: value.length,
			url: ""
		};
		pos = urlEnd + 1;
		while (pos < value.length && /\s/.test(value[pos] ?? "")) pos++;
		return {
			next: pos < value.length && value[pos] === ")" ? pos + 1 : pos,
			url: value.slice(urlStart$1, urlEnd)
		};
	}
	const urlStart = pos;
	while (pos < value.length && value[pos] !== ")") pos++;
	return {
		next: pos < value.length ? pos + 1 : pos,
		url: value.slice(urlStart, pos)
	};
}
function decodeCssEscapes(input) {
	return input.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_match, body) => {
		const hex = body.trim();
		if (/^[0-9a-f]+$/i.test(hex)) {
			const code$1 = Number.parseInt(hex, 16);
			try {
				return Number.isFinite(code$1) ? String.fromCodePoint(code$1) : "";
			} catch {
				return "";
			}
		}
		return String(body).trim();
	});
}
function hasUnsafeCssUrl(value) {
	const decoded = decodeCssEscapes(value);
	const lower = decoded.toLowerCase();
	let pos = 0;
	while (pos < lower.length) {
		const start = lower.indexOf("url(", pos);
		if (start === -1) return false;
		const cssUrl = readCssUrl(decoded, start);
		pos = Math.max(cssUrl.next, start + 4);
		if (!cssUrl.url.trim().startsWith("#")) return true;
	}
	return false;
}
function hasUnsafeStyle(value) {
	const decoded = decodeCssEscapes(value);
	return DISALLOWED_STYLE_PATTERNS.some((re) => re.test(decoded)) || hasUnsafeCssUrl(decoded);
}
function hardenSvgAnchorAttrs(node) {
	if (node.tagName.toLowerCase() !== "a") return;
	if (node.getAttribute("target")?.trim().toLowerCase() !== "_blank") return;
	const relTokens = new Set(String(node.getAttribute("rel") ?? "").split(/\s+/).map((token) => token.trim()).filter(Boolean).filter((token) => token.toLowerCase() !== "opener"));
	relTokens.add("noopener");
	relTokens.add("noreferrer");
	node.setAttribute("rel", Array.from(relTokens).join(" "));
}
function parseSvgNumber(value) {
	const parsed = Number.parseFloat(String(value ?? ""));
	return Number.isFinite(parsed) ? parsed : 0;
}
function collectForeignObjectText(node, parts) {
	if (node.nodeType === Node.TEXT_NODE) {
		const text$1 = node.textContent ?? "";
		if (text$1) parts.push(text$1);
		return;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return;
	const element = node;
	const tag = element.tagName.toLowerCase();
	if (FOREIGN_OBJECT_IGNORED_TAGS.has(tag)) return;
	if (tag === "br") {
		parts.push("\n");
		return;
	}
	for (const child of Array.from(element.childNodes)) collectForeignObjectText(child, parts);
}
function replaceForeignObjectLabels(svgEl) {
	for (const node of Array.from(svgEl.querySelectorAll("foreignObject"))) {
		const parts = [];
		collectForeignObjectText(node, parts);
		const lines = parts.join("").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
		if (!lines.length) {
			node.remove();
			continue;
		}
		const width = parseSvgNumber(node.getAttribute("width"));
		const height = parseSvgNumber(node.getAttribute("height"));
		const x = parseSvgNumber(node.getAttribute("x"));
		const y = parseSvgNumber(node.getAttribute("y"));
		const text$1 = svgEl.ownerDocument.createElementNS(SVG_NS, "text");
		text$1.setAttribute("x", String(x + width / 2));
		text$1.setAttribute("y", String(y + height / 2));
		text$1.setAttribute("text-anchor", "middle");
		text$1.setAttribute("dominant-baseline", "central");
		const label = node.querySelector(".nodeLabel");
		if (label?.getAttribute("class")) text$1.setAttribute("class", label.getAttribute("class"));
		if (lines.length === 1) text$1.textContent = lines[0];
		else {
			const firstDy = -.6 * (lines.length - 1);
			for (const [index, line] of lines.entries()) {
				const tspan = svgEl.ownerDocument.createElementNS(SVG_NS, "tspan");
				tspan.setAttribute("x", String(x + width / 2));
				tspan.setAttribute("dy", index === 0 ? `${firstDy}em` : "1.2em");
				tspan.textContent = line;
				text$1.appendChild(tspan);
			}
		}
		node.parentNode?.replaceChild(text$1, node);
	}
}
function scrubSvgElement(svgEl) {
	replaceForeignObjectLabels(svgEl);
	const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll("*"))];
	for (const node of nodes) {
		const tag = node.tagName.toLowerCase();
		if (!ALLOWED_SVG_TAGS.has(tag)) {
			node.remove();
			continue;
		}
		if (tag === "style") {
			if (hasUnsafeStyle(node.textContent ?? "")) {
				node.remove();
				continue;
			}
		}
		const attrs = Array.from(node.attributes);
		for (const attr of attrs) {
			const name = attr.name.toLowerCase();
			if (/^on/i.test(name)) {
				node.removeAttribute(attr.name);
				continue;
			}
			if (name === "style" && attr.value) {
				if (hasUnsafeStyle(attr.value)) {
					node.removeAttribute(attr.name);
					continue;
				}
			}
			if (name === "srcdoc") {
				node.removeAttribute(attr.name);
				continue;
			}
			if (URL_LIKE_SVG_ATTRS.has(name) && attr.value) {
				const safe = sanitizeSvgUrl(tag, name, attr.value);
				if (!safe) {
					node.removeAttribute(attr.name);
					continue;
				}
				if (safe !== attr.value) node.setAttribute(attr.name, safe);
				continue;
			}
			if (URL_REFERENCE_SVG_ATTRS.has(name) && attr.value && hasUnsafeCssUrl(attr.value)) {
				node.removeAttribute(attr.name);
				continue;
			}
			if (attr.value) {
				const neutralized = neutralizeScriptProtocols(attr.value);
				if (neutralized !== attr.value) node.setAttribute(attr.name, neutralized);
			}
		}
		hardenSvgAnchorAttrs(node);
	}
}
/**
* Sanitizes Mermaid SVG with DOMParser and returns a detached SVG element.
* Returns null in non-DOM runtimes such as plain Node.js.
*/
function toSafeSvgElement(svg) {
	if (typeof DOMParser === "undefined") return null;
	if (!svg) return null;
	try {
		const svgEl = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
		if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") return null;
		const svgElement = svgEl;
		scrubSvgElement(svgElement);
		if (isBrokenMermaidSvgElement(svgElement)) return null;
		return svgElement;
	} catch {
		return null;
	}
}
/**
* Sanitizes Mermaid SVG with DOMParser.
* Returns null in non-DOM runtimes such as plain Node.js.
*/
function sanitizeMermaidSvg(svg) {
	return toSafeSvgElement(svg)?.outerHTML ?? null;
}
/**
* Sanitizes Mermaid SVG with DOMParser.
* Returns an empty string in non-DOM runtimes such as plain Node.js.
*/
function toSafeMermaidSvgMarkup(svg) {
	return sanitizeMermaidSvg(svg) ?? "";
}
function isBrokenMermaidSvg(svg) {
	if (!svg) return true;
	if (typeof DOMParser === "undefined") return true;
	try {
		const svgEl = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
		if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") return true;
		return isBrokenMermaidSvgElement(svgEl);
	} catch {
		return true;
	}
}
function isBrokenMermaidSvgElement(svgEl) {
	const viewBox = svgEl.getAttribute("viewBox");
	if (viewBox) {
		const parts = viewBox.trim().split(/[\s,]+/);
		if (parts.length === 4) {
			const width = Number.parseFloat(parts[2] || "");
			const height = Number.parseFloat(parts[3] || "");
			if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return true;
		}
	}
	const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll("*"))];
	let hasRenderableNode = false;
	for (const node of nodes) {
		if (isRenderableSvgNode(node)) hasRenderableNode = true;
		for (const attr of Array.from(node.attributes)) {
			if (/\bNaN\b/i.test(attr.value)) return true;
			if (attr.name === "style" && /max-width:\s*0(?:px)?/i.test(attr.value)) return true;
		}
	}
	return !hasRenderableNode;
}

//#endregion
//#region src/index.ts
const _registeredMarkdownPlugins = [];
function registerMarkdownPlugin(plugin) {
	_registeredMarkdownPlugins.push(plugin);
}
function clearRegisteredMarkdownPlugins() {
	_registeredMarkdownPlugins.length = 0;
}
function escapeHtml(value) {
	return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function sanitizeFenceLanguage(info) {
	return (String(info || "text").trim().split(/\s+/)[0] || "text").replace(/[^\w+.#:-]/g, "-").replace(/-+/g, "-") || "text";
}
function makeSafeDomId(value) {
	return value.replace(/[^\w:.+-]/g, "-").replace(/-+/g, "-");
}
function getMarkdown(msgId = `editor-${Date.now()}`, options = {}) {
	const md = factory(options);
	const defaultTranslations = { "common.copy": "Copy" };
	let t;
	if (typeof options.i18n === "function") t = options.i18n;
	else if (options.i18n && typeof options.i18n === "object") {
		const i18nMap = options.i18n;
		t = (key) => i18nMap[key] ?? defaultTranslations[key] ?? key;
	} else t = (key) => defaultTranslations[key] ?? key;
	if (Array.isArray(options.plugin)) for (const p of options.plugin) {
		const pluginItem = p;
		if (Array.isArray(pluginItem)) {
			const [fn, ...params] = pluginItem;
			if (typeof fn === "function") md.use(fn, ...params);
		} else if (typeof pluginItem === "function") md.use(pluginItem);
	}
	if (Array.isArray(options.apply)) for (const fn of options.apply) try {
		fn(md);
	} catch (e) {
		console.error("[getMarkdown] apply function threw an error", e);
	}
	if (_registeredMarkdownPlugins.length) {
		for (const p of _registeredMarkdownPlugins) if (Array.isArray(p)) {
			const [fn, ...params] = p;
			if (typeof fn === "function") md.use(fn, ...params);
		} else if (typeof p === "function") md.use(p);
	}
	md.use(sub_plugin);
	md.use(sup_plugin);
	md.use(ins_plugin$1);
	const checkboxModule = import_markdown_it_task_checkbox;
	const markdownItCheckboxPlugin = checkboxModule.default ?? checkboxModule;
	md.use(markdownItCheckboxPlugin);
	md.use(ins_plugin);
	md.use(footnote_plugin);
	md.core.ruler.after("block", "mark_fence_closed", (state) => {
		const s = state;
		const src = s.src;
		const envFinal = !!s.env?.__markstreamFinal;
		const lines = src.split(/\r?\n/);
		for (const token of s.tokens) {
			if (token.type !== "fence" || !token.map || !token.markup) continue;
			const openLine = token.map[0];
			const endLine = token.map[1];
			const markup = token.markup;
			const marker = markup[0];
			const minLen = markup.length;
			const line = lines[Math.max(0, endLine - 1)] ?? "";
			let i = 0;
			while (i < line.length && (line[i] === " " || line[i] === "	")) i++;
			let count = 0;
			while (i + count < line.length && line[i + count] === marker) count++;
			let j = i + count;
			while (j < line.length && (line[j] === " " || line[j] === "	")) j++;
			const closed = envFinal ? true : endLine > openLine + 1 && count >= minLen && j === line.length;
			const tokenShape = token;
			tokenShape.meta = tokenShape.meta ?? {};
			tokenShape.meta.unclosed = !closed;
			tokenShape.meta.closed = !!closed;
		}
	});
	const waveRule = (state, silent) => {
		const s = state;
		const start = s.pos;
		if (s.src[start] !== "~") return false;
		const prevChar = s.src[start - 1];
		const nextChar = s.src[start + 1];
		if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
			if (!silent) {
				const token = s.push("text", "", 0);
				token.content = "~";
			}
			s.pos += 1;
			return true;
		}
		return false;
	};
	md.inline.ruler.before("sub", "wave", waveRule);
	md.renderer.rules.fence = (tokens, idx) => {
		const tokenShape = tokens[idx];
		const info = String(tokenShape.info ?? "").trim();
		const str = String(tokenShape.content ?? "");
		const encodedCode = btoa(unescape(encodeURIComponent(str)));
		const language = sanitizeFenceLanguage(info);
		const escapedLanguage = escapeHtml(language);
		const uniqueId = makeSafeDomId(`editor-${msgId}-${idx}-${language}`);
		const copyLabel = escapeHtml(t("common.copy"));
		return `<div class="code-block" data-code="${encodedCode}" data-lang="${escapedLanguage}" id="${uniqueId}">
      <div class="code-header">
        <span class="code-lang">${escapeHtml(language.toUpperCase())}</span>
        <button class="copy-button" data-code="${encodedCode}">${copyLabel}</button>
      </div>
      <div class="code-editor"></div>
    </div>`;
	};
	const RE_REFERENCE = /^\[(\d+)\]/;
	const RE_REFERENCE_LABEL = /^\[([^\]\n]+)\]/;
	const shouldPreserveReferenceStyleLink = (afterMatch) => {
		if (!afterMatch.startsWith("[")) return false;
		const nextLabelMatch = RE_REFERENCE_LABEL.exec(afterMatch);
		if (!nextLabelMatch) return afterMatch !== "[" && !/^\[\d+$/.test(afterMatch);
		const nextLabel = String(nextLabelMatch[1] ?? "");
		if (afterMatch.slice(nextLabelMatch[0].length).startsWith("(")) return false;
		return !/^\d+$/.test(nextLabel);
	};
	const referenceInline = (state, silent) => {
		const s = state;
		if (s.src[s.pos] !== "[") return false;
		const match = RE_REFERENCE.exec(s.src.slice(s.pos));
		if (!match) return false;
		const lookbehind = s.src.slice(Math.max(0, s.pos - 120), s.pos);
		if (/"[^"\n]{1,80}"\s*:\s*$/.test(lookbehind)) return false;
		const afterMatch = s.src.slice(s.pos + match[0].length);
		if (afterMatch.startsWith("](") || afterMatch.startsWith("(") || shouldPreserveReferenceStyleLink(afterMatch)) return false;
		if (!silent) {
			const id = match[1];
			const token = s.push("reference", "span", 0);
			token.content = id;
			token.markup = match[0];
			token.raw = match[0];
		}
		s.pos += match[0].length;
		return true;
	};
	md.inline.ruler.before("escape", "reference", referenceInline);
	md.renderer.rules.reference = (tokens, idx) => {
		const tokensAny = tokens;
		const id = String(tokensAny[idx].content ?? "");
		return `<span class="reference-link" data-reference-id="${id}" role="button" tabindex="0" title="Click to view reference">${id}</span>`;
	};
	return md;
}

//#endregion
exports.BLOCKED_HTML_TAGS = BLOCKED_HTML_TAGS;
exports.BLOCKED_HTML_TAG_NAMES = BLOCKED_HTML_TAG_NAMES;
exports.BLOCK_HTML_TAG_NAMES = BLOCK_HTML_TAG_NAMES;
exports.DANGEROUS_HTML_ATTRS = DANGEROUS_HTML_ATTRS;
exports.DANGEROUS_HTML_ATTR_NAMES = DANGEROUS_HTML_ATTR_NAMES;
exports.ESCAPED_TEX_BRACE_COMMANDS = ESCAPED_TEX_BRACE_COMMANDS;
exports.EXTENDED_STANDARD_HTML_TAGS = EXTENDED_STANDARD_HTML_TAGS;
exports.EXTENDED_STANDARD_HTML_TAG_NAMES = EXTENDED_STANDARD_HTML_TAG_NAMES;
exports.INLINE_HTML_TAG_NAMES = INLINE_HTML_TAG_NAMES;
exports.KATEX_COMMANDS = KATEX_COMMANDS;
exports.NON_STRUCTURING_HTML_TAGS = NON_STRUCTURING_HTML_TAGS;
exports.NON_STRUCTURING_HTML_TAG_NAMES = NON_STRUCTURING_HTML_TAG_NAMES;
exports.SAFE_ALLOWED_HTML_TAGS = SAFE_ALLOWED_HTML_TAGS;
exports.STANDARD_BLOCK_HTML_TAGS = STANDARD_BLOCK_HTML_TAGS;
exports.STANDARD_HTML_TAGS = STANDARD_HTML_TAGS;
exports.SVG_HTML_TAG_NAMES = SVG_HTML_TAG_NAMES;
exports.TEX_BRACE_COMMANDS = TEX_BRACE_COMMANDS;
exports.URL_HTML_ATTRS = URL_HTML_ATTRS;
exports.URL_HTML_ATTR_NAMES = URL_HTML_ATTR_NAMES;
exports.VOID_HTML_TAGS = VOID_HTML_TAGS;
exports.VOID_HTML_TAG_NAMES = VOID_HTML_TAG_NAMES;
exports.applyContainers = applyContainers;
exports.applyMath = applyMath;
exports.clearRegisteredMarkdownPlugins = clearRegisteredMarkdownPlugins;
exports.convertHtmlAttrsToProps = convertHtmlAttrsToProps;
exports.convertHtmlPropValue = convertHtmlPropValue;
exports.findMatchingClose = findMatchingClose;
exports.getHtmlTagFromContent = getHtmlTagFromContent;
exports.getMarkdown = getMarkdown;
exports.hasCompleteHtmlTagContent = hasCompleteHtmlTagContent;
exports.hasCustomHtmlComponents = hasCustomHtmlComponents;
exports.isBrokenMermaidSvg = isBrokenMermaidSvg;
exports.isCustomHtmlComponentTag = isCustomHtmlComponentTag;
exports.isHtmlLikeTagName = isHtmlLikeTagName;
exports.isHtmlTagBlocked = isHtmlTagBlocked;
exports.isHtmlTagHardBlocked = isHtmlTagHardBlocked;
exports.isMathLike = isMathLike;
exports.isUnsafeHtmlUrl = isUnsafeHtmlUrl;
exports.mergeCustomHtmlTags = mergeCustomHtmlTags;
exports.normalizeCustomHtmlTagName = normalizeCustomHtmlTagName;
exports.normalizeCustomHtmlTags = normalizeCustomHtmlTags;
exports.normalizeStandaloneBackslashT = normalizeStandaloneBackslashT;
exports.parseFenceToken = parseFenceToken;
exports.parseInlineTokens = parseInlineTokens;
exports.parseMarkdownToStructure = parseMarkdownToStructure;
exports.processTokens = processTokens;
exports.registerMarkdownPlugin = registerMarkdownPlugin;
exports.resolveCustomHtmlTags = resolveCustomHtmlTags;
exports.sanitizeHtmlAttrs = sanitizeHtmlAttrs;
exports.sanitizeHtmlContent = sanitizeHtmlContent;
exports.sanitizeHtmlTokenAttrs = sanitizeHtmlTokenAttrs;
exports.sanitizeImageSrc = sanitizeImageSrc;
exports.sanitizeMermaidSvg = sanitizeMermaidSvg;
exports.setDefaultMathOptions = setDefaultMathOptions;
exports.shouldOpenLinkInNewTab = shouldOpenLinkInNewTab;
exports.shouldRenderUnknownHtmlTagAsText = shouldRenderUnknownHtmlTagAsText;
exports.stripCustomHtmlWrapper = stripCustomHtmlWrapper;
exports.stripHtmlControlAndWhitespace = stripHtmlControlAndWhitespace;
exports.toSafeMermaidSvgMarkup = toSafeMermaidSvgMarkup;
exports.toSafeSvgElement = toSafeSvgElement;
exports.tokenAttrsToRecord = tokenAttrsToRecord;
exports.tokenizeHtml = tokenizeHtml;
})(exports, module);
global.StreamMarkdownParser = module.exports || exports;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this);
