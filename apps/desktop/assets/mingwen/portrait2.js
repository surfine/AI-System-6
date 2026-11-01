(function (root) {
  'use strict';
  var A = root.PlainArt; if (!A) return;
  var OLD = A.portrait;
  var LINE = '#3B2626', SK = '#F3E3CF', SK_S = '#E2BCA4', SK_D = '#C9967E', BLUSH = '#E8A0A0', WHITE = '#FBF8F2', WHITE_S = '#D9D3DF';

  function P(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function Ln(d, w, col, extra) { return '<path d="' + d + '" fill="none" stroke="' + (col || LINE) + '" stroke-width="' + (w || 1.6) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>'; }
  function O(d, fill, w) { return P(d, fill, ' stroke="' + LINE + '" stroke-width="' + (w || 1.8) + '" stroke-linejoin="round"'); }
  function op(a) { return ' opacity="' + a + '"'; }
  function C(x, y, r, fill, extra) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function E(x, y, rx, ry, fill, extra) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"' + (extra || '') + '/>'; }

  var FACE = 'M138 236C136 196 160 164 200 162C240 164 264 196 262 236C262 262 252 286 236 302C222 316 210 322 200 323C190 322 178 316 164 302C148 286 138 262 138 236Z';
  var FACE_SHADE = 'M262 236C262 262 252 286 236 302C226 312 214 320 204 322C222 300 240 276 246 238C248 214 244 198 238 188C252 198 262 214 262 236Z';
  function ears() {
    return O('M139 238C128 232 124 250 130 262C134 270 140 272 143 268Z', SK, 1.6) + Ln('M134 248q4 4 4 12', 1, SK_D) +
      O('M261 238C272 232 276 250 270 262C266 270 260 272 257 268Z', SK, 1.6) + P('M262 242C270 240 272 254 266 264L260 266Z', SK_S);
  }
  function neck() {
    return O('M182 296C184 326 182 348 172 372L228 372C218 348 216 326 218 296Z', SK, 1.6) +
      P('M181 298C192 318 208 318 219 298L218 326C206 338 194 338 182 326Z', SK_S) +
      Ln('M190 340q-4 18 -12 30M210 340q4 18 12 30', 1, SK_D, op(0.6));
  }

  function irisGrad(c) { var id = 'i2' + c.slice(1); return { id: id, def: '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1420"/><stop offset=".38" stop-color="' + c + '"/><stop offset=".86" stop-color="' + c + '" stop-opacity=".78"/><stop offset="1" stop-color="#F6F0E6"/></linearGradient>' }; }
  function eye(x, side, k, iris) {
    var ey = 252, o2 = side, s = '';
    var wh = 'M' + (x - 15 * o2) + ' ' + (ey + 1) + 'Q' + (x - 3 * o2) + ' ' + (ey - 14) + ' ' + (x + 15 * o2) + ' ' + (ey - 3) + 'Q' + (x + 4 * o2) + ' ' + (ey + 12) + ' ' + (x - 15 * o2) + ' ' + (ey + 1) + 'Z';
    var cid = 'e2' + (side < 0 ? 'L' : 'R') + (k.lid != null ? 'l' + Math.round(k.lid) : '') + (k.small ? 's' : '');
    var r = k.small ? [5.6, 7.4] : [7.8, 10.2], dx = (k.look || 0) * o2 * 0 + (k.look || 0);
    s += '<clipPath id="' + cid + '"><path d="' + wh + '"/></clipPath>' + P(wh, WHITE);
    s += '<g clip-path="url(#' + cid + ')">' + E(x + dx, ey + 1, r[0], r[1], 'url(#' + iris.id + ')') + E(x + dx, ey + 2, r[0] * .42, r[1] * .5, '#120C14') +
      C(x + dx - 3, ey - 4, k.small ? 2 : 3, '#FFFFFF') + C(x + dx + 3.4, ey + 4.4, 1.4, '#FFFFFF', op(0.85)) +
      P('M' + (x - 18) + ' ' + (ey - 16) + 'H' + (x + 18) + 'V' + (ey - 6) + 'Q' + x + ' ' + (ey - 1) + ' ' + (x - 18) + ' ' + (ey - 6) + 'Z', '#2A1E22', op(0.25));
    if (k.lid != null) s += P('M' + (x - 19) + ' ' + (ey - 18) + 'H' + (x + 19) + 'V' + (k.lid + (k.slant || 0) * o2) + 'L' + (x - 19) + ' ' + (k.lid - (k.slant || 0) * o2) + 'Z', SK);
    s += '</g>';
    var top = k.lid != null ? 'M' + (x - 16 * o2) + ' ' + (k.lid - (k.slant || 0) * o2 + 1) + 'L' + (x + 15 * o2) + ' ' + (k.lid + (k.slant || 0) * o2)
      : 'M' + (x + 15 * o2) + ' ' + (ey - 3) + 'Q' + (x - 3 * o2) + ' ' + (ey - 15) + ' ' + (x - 16 * o2) + ' ' + (ey + 1);
    s += Ln(top, 4, '#2A1E22') + Ln('M' + (x - 15 * o2) + ' ' + (ey + 1) + 'l' + (-5 * o2) + ' -4', 2.4, '#2A1E22');
    s += Ln('M' + (x - 10 * o2) + ' ' + (ey + 9) + 'Q' + x + ' ' + (ey + 12) + ' ' + (x + 9 * o2) + ' ' + (ey + 8), 1.2, '#2A1E22', op(0.5));
    return s;
  }
  function closedEye(x, side, up) { var ey = 252; return Ln('M' + (x - 15) + ' ' + (ey + (up ? 3 : 0)) + 'q15 ' + (up ? -14 : 9) + ' 30 0', 3.8, '#2A1E22') + Ln('M' + (x - 15 * side) + ' ' + (ey + (up ? 3 : 0)) + 'l' + (-5 * side) + ' ' + (up ? 1 : -3), 2.2, '#2A1E22'); }
  function brow(x1, y1, x2, y2, col) { return Ln('M' + x1 + ' ' + y1 + 'Q' + ((x1 + x2) / 2) + ' ' + (Math.min(y1, y2) - 3) + ' ' + x2 + ' ' + y2, 2.6, col || '#3A2A2A', op(0.9)); }
  var MOUTH = { neutral: 'M193 291q7 2 14 0', smile: 'M188 287q12 12 24 0', soft: 'M192 289q8 5 16 0', curious: 'M200 291a3.5 4.5 0 1 0 .1 0', annoyed: 'M191 293l18 -4',
    angry: 'M189 294q11 -7 22 0', sad: 'M190 294q10 -7 20 0', tired: 'M191 291q5 -3 9 0q5 3 9 0', surprised: 'M200 286a6 8 0 1 0 .1 0' };
  function face(f, iris, browCol) {
    var L = 176, R = 224, s = '';
    switch (f) {
      case 'smile': s += closedEye(L, -1, true) + closedEye(R, 1, true) + brow(160, 228, 188, 225, browCol) + brow(212, 225, 240, 228, browCol); break;
      case 'soft': s += closedEye(L, -1, false) + closedEye(R, 1, false) + brow(160, 230, 188, 228, browCol) + brow(212, 228, 240, 230, browCol); break;
      case 'curious': s += eye(L, -1, { look: 2 }, iris) + eye(R, 1, { look: 2 }, iris) + brow(160, 228, 188, 229, browCol) + brow(212, 224, 240, 218, browCol); break;
      case 'annoyed': s += eye(L, -1, { lid: 249, look: 3 }, iris) + eye(R, 1, { lid: 249, look: 3 }, iris) + brow(160, 236, 188, 239, browCol) + brow(212, 239, 240, 236, browCol); break;
      case 'angry': s += eye(L, -1, { lid: 249, slant: -3 }, iris) + eye(R, 1, { lid: 249, slant: -3 }, iris) + brow(158, 226, 188, 238, browCol) + brow(212, 238, 242, 226, browCol); break;
      case 'sad': s += eye(L, -1, { lid: 248, slant: 3 }, iris) + eye(R, 1, { lid: 248, slant: 3 }, iris) + brow(160, 238, 188, 228, browCol) + brow(212, 228, 240, 238, browCol); break;
      case 'tired': s += eye(L, -1, { lid: 253 }, iris) + eye(R, 1, { lid: 253 }, iris) + Ln('M164 266q12 5 24 0M212 266q12 5 24 0', 1.6, '#7A6A9A', op(0.5)) + brow(160, 234, 188, 232, browCol) + brow(212, 232, 240, 234, browCol); break;
      case 'surprised': s += eye(L, -1, { small: true }, iris) + eye(R, 1, { small: true }, iris) + brow(160, 220, 188, 216, browCol) + brow(212, 216, 240, 220, browCol); break;
      default: s += eye(L, -1, {}, iris) + eye(R, 1, {}, iris) + brow(160, 230, 188, 229, browCol) + brow(212, 229, 240, 230, browCol);
    }
    s += Ln('M202 266q2.5 6 -2.5 8.5', 1.4, SK_D, op(0.9)) + P('M199 275q4 2 6 0', SK_S);
    s += Ln(MOUTH[f] || MOUTH.neutral, 2, '#6A3434') + (f === 'surprised' || f === 'curious' ? '' : P('M194 296q6 3 12 0', SK_S, op(0.7)));
    if (f === 'smile' || f === 'soft' || f === 'surprised') s += E(165, 278, 11, 5, BLUSH, op(0.45)) + E(235, 278, 11, 5, BLUSH, op(0.45));
    return s;
  }

  function mix(a, b, t) {
    var pa = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), pb = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return '#' + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0'); }).join('');
  }
  function shade(c) { return mix(c, '#2A1E3A', 0.38); }
  function light(c) { return mix(c, '#FFF6EA', 0.28); }

  function hairSet(h) {
    var c = h.col, cs = shade(c), ch = light(c);
    return {
      back: (h.extraBack || '') + O(h.back, c, 1.8) + (h.backShade ? P(h.backShade, cs) : ''),
      front: O(h.front, c, 1.8) + (h.frontShade ? P(h.frontShade, cs) : '') +
        (h.ring ? P(h.ring, ch, op(0.85)) : '') + (h.strands ? Ln(h.strands, 1.1, cs, op(0.9)) : '') + (h.sides ? O(h.sides, c, 1.6) + (h.sideShade ? P(h.sideShade, cs) : '') : ''),
      fringeShadow: h.fringeShadow ? P(h.fringeShadow, SK_S) : ''
    };
  }

  var CAST = {};

  CAST.me = {
    iris: '#3D5A8A', brow: '#24222E',
    hair: {
      col: '#25242F',
      back: 'M128 262C114 190 140 116 204 112C270 116 294 190 280 262C278 290 268 312 258 322L250 300L150 300L142 322C134 310 128 292 128 262Z',
      backShade: 'M250 300L258 322C268 312 278 290 280 262C282 230 278 200 268 180C270 220 264 266 250 300Z',
      front: 'M136 228C130 176 156 128 210 124C258 126 276 168 270 220C264 206 256 194 248 184C252 200 250 214 244 226C238 210 230 198 220 188C222 204 220 218 214 230C208 214 200 202 190 194C190 208 184 222 176 232C174 216 172 204 166 196C160 210 154 222 150 236C146 222 146 210 148 198C142 208 138 218 136 228Z',
      frontShade: 'M248 184C256 194 264 206 270 220C274 196 268 166 252 148C256 160 254 172 248 184Z',
      ring: 'M164 152C186 140 224 138 246 150C240 153 234 153 228 151C224 155 216 155 210 152C202 156 194 156 188 152C180 156 172 156 166 155Z',
      strands: 'M190 132C178 150 170 170 166 196M218 130C214 152 216 176 220 188M238 140C244 156 248 170 248 184M176 176C180 190 184 200 190 206',
      sides: 'M138 222C130 252 132 284 142 312C146 290 150 266 156 244ZM268 222C274 252 272 282 262 306C258 286 254 266 250 246Z',
      sideShade: 'M268 222C274 252 272 282 262 306C262 282 262 256 258 236Z',
      fringeShadow: 'M152 238C156 228 162 216 166 206C170 216 174 228 176 238C182 230 188 218 190 206C196 214 206 226 212 236C218 226 220 214 220 202C228 212 236 222 242 232C246 222 248 212 248 200C254 208 260 216 264 226L262 232C254 236 246 236 240 236C230 238 222 240 212 240C202 241 190 242 178 242C168 242 160 242 152 238Z'
    },
    back: function () { // 书箱在左肩后
      return O('M64 300L150 290L156 420L70 432Z', '#7A5634', 2) + P('M64 300L150 290L152 318L66 330Z', '#5A4636') + P('M118 296L150 290L156 420L124 426Z', '#5E4228') +
        O('M58 290L150 278L152 292L60 304Z', '#5A4636', 1.6) + O('M96 352h26v18h-26z', '#C9A24A', 1.2) + Ln('M70 380L154 370', 1.2, '#3B2E26', op(0.6));
    },
    body: function () {
      var coat = '#26406A', cs = shade(coat), chl = light(coat);
      var s = '';
      s += O('M200 362L166 366C140 372 112 382 92 398C70 416 62 450 58 500L52 600L348 600L342 500C338 450 330 416 308 398C288 382 260 372 234 366Z', coat, 2);
      s += P('M234 366C260 372 288 382 308 398C330 416 338 450 342 500L348 600L264 600C266 540 262 480 252 440C246 410 240 386 234 366Z', cs);
      s += P('M96 404C80 424 72 452 70 486C76 460 86 438 104 420Z', chl, op(0.7));
      s += Ln('M98 412C86 462 84 530 88 600', 1.8) + Ln('M302 412C314 462 316 530 312 600', 1.8);
      s += Ln('M128 444C146 474 156 520 154 600M272 444C254 474 248 520 250 600', 1.3, cs) + Ln('M118 470C126 500 128 530 126 560', 1, cs, op(0.7));
      s += O('M172 378L176 334C190 328 210 328 224 334L228 378C214 370 186 370 172 378Z', coat, 1.8) + P('M212 330C218 330 222 332 224 334L228 378C222 374 216 372 212 371Z', cs) + Ln('M186 334L184 372M214 334L216 372', 1, cs);
      s += O('M182 372L200 418L218 372C210 368 190 368 182 372Z', WHITE, 1.6) + P('M200 418L218 372C214 370 210 370 206 370Z', WHITE_S);
      s += Ln('M200 418C202 470 204 530 204 600', 1.6) + [452, 492, 532, 572].map(function (y) { return C(212, y, 4, '#C9A24A', ' stroke="' + LINE + '" stroke-width="1"'); }).join('');
      s += O('M118 392L138 382L320 590L296 600Z', '#5A4636', 1.6) + P('M128 388L138 382L320 590L310 596Z', '#3E2E22');
      s += '<g transform="translate(236 432) rotate(-28)">' + O('M0 -11Q9 0 0 11Q-9 0 0 -11Z', '#2E7D62', 1.4) + Ln('M0 -9V9', 1, '#9FE0BE') + C(-2, -4, 1.6, '#D8F5E6') + '</g>';
      return s;
    },
    extra: function () { // 耳后羽毛笔
      return '<g transform="translate(268 238) rotate(28)">' + O('M0 0C-6 -26 -2 -54 8 -70C14 -50 12 -24 2 0Z', '#F6F2EA', 1.2) + Ln('M2 0C2 -24 4 -48 8 -66', 1, '#C8C0B4') + '</g>';
    }
  };


  function hairBob(col) { // 齐耳短发、平刘海（许鸢）
    return { col: col,
      back: 'M126 270C112 188 140 116 202 112C266 116 292 188 278 270C276 296 270 312 262 318L254 296L148 296L140 318C132 312 128 296 126 270Z',
      backShade: 'M254 296L262 318C270 312 276 296 278 270C280 236 276 204 266 182C268 226 266 266 254 296Z',
      front: 'M134 234C128 174 156 126 202 122C250 126 276 174 268 234C258 238 250 232 242 236C232 240 222 234 212 238C202 242 192 236 182 240C172 242 164 236 154 240C146 240 140 238 134 234Z',
      frontShade: 'M238 132C258 146 270 180 268 232L262 230C264 200 256 160 238 132Z',
      ring: 'M162 154C184 142 222 140 244 152C238 155 232 155 226 153C220 157 212 157 206 154C198 158 190 158 184 154C176 158 168 158 164 156Z',
      strands: 'M186 132C176 160 170 200 168 238M214 128C216 160 214 200 212 236M240 140C246 170 246 200 242 234M162 150C156 180 154 210 156 238',
      sides: 'M134 226C126 258 130 292 140 314L156 300C150 278 148 252 150 232ZM266 226C274 258 270 292 260 314L244 300C250 278 252 252 250 232Z',
      sideShade: 'M266 226C274 258 270 292 260 314L252 306C258 282 260 256 258 232Z',
      fringeShadow: 'M136 236C146 242 158 240 168 244C180 246 192 240 204 244C216 246 226 240 238 242C248 242 258 240 266 238L264 248C230 252 170 252 138 246Z' };
  }
  function hairMessy(col) { // 乱翘短发（知秋、小满、林折）
    return { col: col,
      back: 'M130 258C114 186 142 112 204 108C270 112 294 186 278 258C274 282 266 296 258 302L250 280L152 280L144 302C136 296 132 282 130 258Z',
      backShade: 'M250 280L258 302C266 296 274 282 278 258C280 226 276 196 266 176C268 216 264 254 250 280Z',
      front: 'M134 230C126 170 156 120 206 118C256 122 280 168 270 226L262 214L260 232L250 206L244 228L232 200L226 226L214 200L208 230L198 202L190 230L180 204L174 230L164 208L160 232L150 212L146 234L140 220Z',
      frontShade: 'M244 128C264 144 276 180 270 226L262 214C266 182 258 152 244 128Z',
      ring: 'M164 150C186 138 224 136 246 148C240 151 234 151 228 149C222 153 214 153 208 150C200 154 192 154 186 150C178 154 170 154 166 153Z',
      strands: 'M188 126C176 150 168 180 164 208M218 124C222 150 226 178 232 200M150 150C146 170 146 190 150 212',
      sides: 'M136 222C130 248 132 270 140 290L154 246ZM266 222C272 248 270 270 262 290L248 246Z',
      fringeShadow: 'M146 234L150 240L160 232L164 240L174 230L180 240L190 230L198 240L208 230L214 240L226 226L232 238L244 228L250 238L260 232L264 240C230 246 170 246 146 240Z' };
  }
  function hairNeat(col, forehead) { // 偏分短发，露额（易澄、罗砚、父亲、钟先生）
    var b = forehead || 0;
    return { col: col,
      back: 'M132 250C118 184 144 114 204 110C266 114 290 184 276 250C272 272 264 284 256 288L248 266L154 266L146 288C138 284 134 272 132 250Z',
      backShade: 'M248 266L256 288C264 284 272 272 276 250C278 220 274 192 264 174C266 212 262 244 248 266Z',
      front: 'M136 ' + (220 - b) + 'C130 168 158 120 206 118C254 122 278 166 268 ' + (220 - b) + 'C262 ' + (200 - b) + ' 248 ' + (184 - b) + ' 230 ' + (176 - b) + 'C234 ' + (190 - b) + ' 232 ' + (202 - b) + ' 226 ' + (214 - b) + 'C214 ' + (196 - b) + ' 196 ' + (184 - b) + ' 176 ' + (182 - b) + 'C168 ' + (194 - b) + ' 160 ' + (204 - b) + ' 150 ' + (214 - b) + 'C148 ' + (206 - b) + ' 146 ' + (198 - b) + ' 148 ' + (190 - b) + 'C142 ' + (200 - b) + ' 138 ' + (210 - b) + ' 136 ' + (220 - b) + 'Z',
      frontShade: 'M240 128C262 144 274 176 268 ' + (220 - b) + 'C262 ' + (204 - b) + ' 254 ' + (190 - b) + ' 244 ' + (182 - b) + 'C250 168 248 146 240 128Z',
      ring: 'M164 148C186 136 224 134 246 146C240 149 234 149 228 147C222 151 214 151 208 148C200 152 192 152 186 148C178 152 170 152 166 151Z',
      strands: 'M176 130C190 150 206 164 226 ' + (212 - b) + 'M200 124C214 140 226 156 232 ' + (176 - b),
      sides: 'M138 214C134 236 136 254 142 270L150 230ZM266 214C270 236 268 254 262 270L254 230Z',
      fringeShadow: 'M150 ' + (216 - b) + 'C164 ' + (206 - b) + ' 172 ' + (194 - b) + ' 178 ' + (186 - b) + 'C198 ' + (190 - b) + ' 214 ' + (202 - b) + ' 226 ' + (218 - b) + 'C232 ' + (206 - b) + ' 234 ' + (194 - b) + ' 232 ' + (184 - b) + 'C248 ' + (194 - b) + ' 258 ' + (206 - b) + ' 264 ' + (222 - b) + 'L262 ' + (228 - b) + 'C230 ' + (232 - b) + ' 180 ' + (232 - b) + ' 150 ' + (226 - b) + 'Z' };
  }
  function hairLong(col) { // 及胸长直发（长庚）
    var h = hairNeat(col, 0);
    h.back = 'M124 260C106 180 138 108 204 104C272 108 302 180 284 260C282 330 290 400 300 470L262 476C258 420 254 360 250 300L156 300C152 360 148 420 142 476L104 470C114 400 120 330 124 260Z';
    h.backShade = 'M250 300C254 360 258 420 262 476L300 470C290 400 282 330 284 260C286 230 282 200 272 180C276 230 270 270 250 300Z';
    h.front = 'M134 232C126 172 156 122 204 118C254 122 280 172 272 232L264 220C262 202 254 186 244 178L236 228C232 208 224 192 212 184L206 232C202 212 194 196 184 188L176 232C172 214 166 200 156 192L150 236C146 220 146 206 148 196Z';
    h.fringeShadow = 'M150 236L156 196C164 204 172 218 176 236L184 192C194 202 202 216 206 236L212 188C224 196 232 212 236 232L244 182C254 192 262 206 264 222L262 240C228 246 176 246 150 242Z';
    h.sides = 'M136 226C126 270 128 330 136 400L154 392C150 330 150 270 154 236ZM268 226C278 270 276 330 268 400L250 392C254 330 254 270 250 236Z';
    h.sideShade = 'M268 226C278 270 276 330 268 400L260 396C266 340 266 280 260 236Z';
    return h;
  }
  function hairBun(col) { // 低发髻（母亲）
    var h = hairNeat(col, 8);
    h.back = 'M132 248C118 184 144 116 204 112C264 116 288 184 274 248C270 268 262 278 254 282L248 262L156 262L150 282C142 278 136 268 132 248Z';
    h.extraBack = O('M262 286m-24 0a24 22 0 1 0 48 0a24 22 0 1 0 -48 0Z', col, 1.8) + P('M262 286m-10 -16a24 22 0 0 1 22 30L262 286Z', shade(col)) + Ln('M236 270L294 304', 3.4, '#7A5634') + C(294, 304, 3, '#C9A24A');
    return h;
  }

  function torso(col, opt) {
    opt = opt || {}; var cs = shade(col), chl = light(col);
    var s = O('M200 362L166 366C140 372 112 382 92 398C70 416 62 450 58 500L52 600L348 600L342 500C338 450 330 416 308 398C288 382 260 372 234 366Z', col, 2);
    s += P('M234 366C260 372 288 382 308 398C330 416 338 450 342 500L348 600L264 600C266 540 262 480 252 440C246 410 240 386 234 366Z', cs);
    s += P('M96 404C80 424 72 452 70 486C76 460 86 438 104 420Z', chl, op(0.7));
    s += Ln('M98 412C86 462 84 530 88 600', 1.8) + Ln('M302 412C314 462 316 530 312 600', 1.8);
    if (!opt.plain) s += Ln('M128 444C146 474 156 520 154 600M272 444C254 474 248 520 250 600', 1.3, cs) + Ln('M118 470C126 500 128 530 126 560', 1, cs, op(0.7));
    return s;
  }
  function vneck(col, deep) { var d = deep || 418; return O('M180 372L200 ' + d + 'L220 372C210 366 190 366 180 372Z', col, 1.6) + P('M200 ' + d + 'L220 372C216 370 212 370 206 370Z', shade(col)); }
  function apron(col, top) { var cs = shade(col); top = top || 430; return O('M138 ' + top + 'L262 ' + top + 'L276 600L124 600Z', col, 1.8) + P('M222 ' + top + 'L262 ' + top + 'L276 600L236 600Z', cs) + Ln('M150 ' + top + 'L118 380M250 ' + top + 'L282 380', 3, cs) + Ln('M170 500C172 540 172 570 170 600M224 500C228 540 230 570 232 600', 1.2, cs); }
  function cape(col, y) { var cs = shade(col); y = y || 470; return O('M164 368C120 376 84 400 72 ' + (y - 20) + 'Q200 ' + (y + 40) + ' 328 ' + (y - 20) + 'C316 400 280 376 236 368Z', col, 1.8) + P('M236 368C280 376 316 400 328 ' + (y - 20) + 'Q290 ' + (y + 10) + ' 252 ' + (y + 12) + 'C254 420 248 388 236 368Z', cs) + Ln('M130 400Q150 440 156 ' + (y + 8) + 'M270 400Q252 440 246 ' + (y + 10), 1.2, cs); }


  CAST.yuan = { iris: '#9A6A3E', brow: '#4A2C24', hair: hairBob('#5A3428'),
    back: function () { return '<g transform="rotate(-22 110 380)">' + O('M88 240h38v260h-38z', '#F4EEE2', 1.8) + P('M112 240h14v260h-14z', '#D9D0C0') + O('M88 280h38v10h-38z', '#2E4A7A', 1.2) + O('M107 240m-19 0a19 7 0 1 0 38 0a19 7 0 1 0 -38 0', '#E4D9C4', 1.4) + '</g>'; },
    body: function (f, o) {
      var red = '#B83A2C', s = torso('#22355E', { plain: true });
      s += O('M168 364C126 372 82 396 62 452L46 600L150 600L170 470L200 420L230 470L250 600L354 600L338 452C318 396 274 372 232 364L214 380L200 400L186 380Z', red, 2);
      s += P('M232 364C274 372 318 396 338 452L354 600L300 600C296 520 280 450 252 410C244 394 238 378 232 364Z', shade(red));
      s += P('M80 430C70 470 62 520 58 560L72 560C78 520 86 476 96 440Z', light(red), op(0.6)) + Ln('M120 420C126 470 132 530 130 600M286 430C278 480 270 540 272 600', 1.3, shade(red));
      s += vneck(WHITE, 404) + Ln('M200 404L200 436', 1.2, '#C9A24A') + '<g transform="translate(200 448)">' + O('M0 -12a12 12 0 1 0 .1 0Z', '#E8C27A', 1.4) + O('M0 -8L3 0L0 8L-3 0Z', '#B83A2C', 1) + '</g>';
      if (o.mask) s += '';
      return s;
    },
    extra: function (f, o) {
      var s = Ln('M138 196C170 182 230 180 264 194', 3.4, '#E8D9A8') + Ln('M146 192l2 5M160 188l2 5M174 186l2 5M188 184l1 5M202 184l1 5M216 184l1 5M230 186l1 5M244 188l1 5', 1, '#8A7A4A');
      if (o.mask) s += O('M140 236Q158 254 182 246Q194 242 200 252Q206 242 218 246Q242 254 260 236Q258 268 240 280Q220 290 204 280L200 274L196 280Q180 290 160 280Q142 268 140 236Z', '#FBF6EC', 1.6) + P('M156 254Q172 244 188 256Q172 264 156 254ZM212 256Q228 244 244 254Q228 264 212 256Z', '#2A1E22') + Ln('M262 240Q276 270 266 300Q258 324 274 350', 4.4, '#B83A2C');
      return s;
    } };

  CAST.qiu = { iris: '#7A8CB0', brow: '#2E3038', hair: hairMessy('#2E3038'),
    body: function () {
      var s = torso('#3E434C');
      s += O('M146 420h108v58h-108z', '#6E5236', 1.8) + P('M222 420h32v58h-32z', '#553E28') + Ln('M146 440h108M146 460h108M182 420v58M218 420v58', 1, '#3B2E26') + O('M192 444h16v12h-16z', '#C9C2B4', 1);
      return s;
    },
    extra: function () { // 围巾盖住口鼻下半与脖子，两条长尾
      var sc = '#C8CCD4', ss = shade(sc);
      return O('M150 286C172 298 228 298 250 286L262 330C246 356 154 356 138 330Z', sc, 1.8) + P('M226 294C238 292 246 290 250 286L262 330C254 342 240 350 226 352Z', ss) +
        O('M150 344L130 470L162 476L176 352Z', sc, 1.6) + O('M232 350L262 480L232 486L216 356Z', sc, 1.6) + P('M232 350L262 480L248 484L226 356Z', ss) + Ln('M160 306C180 314 220 314 240 306M154 322C180 332 220 332 246 322', 1.1, ss);
    } };

  CAST.cheng = { iris: '#6A8296', brow: '#2A2420', hair: hairNeat('#2A2420', 4),
    body: function () { var s = torso('#E8E2D6') + cape('#4E6578', 478) + vneck('#2F3E4C', 400); s += O('M150 500h70v60h-70z', '#F4EEE2', 1.6) + Ln('M162 516h46M162 530h46M162 544h30', 1, '#9A8E7A') + Ln('M206 500v74M212 500v70', 3, '#B83A2C'); return s; },
    extra: function () {
      return O('M138 168L144 140C170 130 232 130 258 140L264 168C230 160 172 160 138 168Z', '#3E5262', 1.8) + O('M128 172C160 160 242 160 274 172L270 182C240 174 162 174 132 182Z', '#2E3E4C', 1.6) + O('M190 142h22v14h-22z', '#C9A24A', 1.2) +
        '<text x="201" y="153" font-size="10" text-anchor="middle" fill="#3B2E26" font-family="serif">07</text>' +
        '<g transform="translate(292 392)">' + O('M-22 0C-22 -18 4 -24 18 -12L30 -16L24 -6C30 6 14 18 -6 16Z', '#F4F2EE', 1.6) + C(14, -12, 2, '#2A1E22') + P('M-18 2C-10 10 6 12 16 6C4 6 -8 4 -18 2Z', '#C8C4C0') + '</g>';
    } };

  CAST.yan = { iris: '#4A7A60', brow: '#2A2420', hair: hairNeat('#2A2420', 2),
    back: function () { return O('M318 40h10v560h-10z', '#4A3626', 1.4) + O('M308 26h30l-6 18h-18z', '#C9A24A', 1.4) + C(323, 22, 6, '#F4C77A', op(0.9)); },
    body: function () { var s = torso(WHITE) + vneck('#E4DED2', 404) + apron('#2F5A44', 420); s += Ln('M236 520q10 14 4 30M246 520q12 10 10 28', 2, '#C9A24A') + O('M232 512a6 6 0 1 0 .1 0Z', '#C9A24A', 1.2) + O('M140 470h18v18h-18z', '#B83A2C', 1) + '<text x="149" y="484" font-size="11" text-anchor="middle" fill="#FBF8F2" font-family="serif">准</text>'; return s; } };

  CAST.man = { iris: '#4F86C2', brow: '#5A3E2A', hair: (function () { var h = hairMessy('#6E4A33'); h.strands += 'M204 118q8 -30 26 -26q-14 6 -18 26'; return h; })(),
    body: function () {
      var s = torso(WHITE) + cape('#5E8FC2', 470);
      s += O('M126 470h150v20h-150z', '#F4EEE2', 1.4) + O('M120 490h160v22h-160z', '#FBF8F2', 1.4) + O('M130 512h146v20h-146z', '#F0E8DA', 1.4) + O('M124 532h156v22h-156z', '#FBF8F2', 1.4) + O('M118 466h12v10h-12z', '#B83A2C', 1);
      s += O('M110 520C116 500 140 498 150 516L148 560C134 566 116 560 110 548Z', SK, 1.6) + O('M290 520C284 500 260 498 250 516L252 560C266 566 284 560 290 548Z', SK, 1.6);
      return s;
    },
    extra: function () { return Ln('M204 120q8 -30 26 -26q-14 6 -18 26', 4, '#6E4A33') + '<g transform="translate(246 168) rotate(-30)">' + O('M0 0C-4 -16 2 -30 10 -36C14 -22 10 -8 2 0Z', '#FBF8F2', 1.1) + '</g>'; } };

  CAST.ye = { iris: '#7A5AA0', brow: '#2F2F38', hair: hairNeat('#2A2830', 0),
    body: function () {
      var s = torso('#2F2F38');
      s += O('M160 362L200 410L240 362L232 352L168 352Z', '#24242C', 1.6);
      s += '<g transform="translate(110 470)">' + Ln('M0 0L-10 40', 2, '#3B2E26') + O('M-24 40h28v34h-28z', '#F4C77A', 1.6) + C(-10, 57, 34, '#FFD9A0', op(0.25)) + O('M-30 34h40v8h-40z', '#3B2E26', 1.2) + '</g>';
      s += O('M112 448C120 436 140 438 142 452L136 474C126 478 114 472 112 462Z', '#6B4C8A', 1.6);
      return s;
    },
    extra: function (f) { // 兜帽
      var hood = '#33333E', hs = shade(hood);
      return O('M120 300C104 220 132 120 204 112C276 120 300 220 284 300C284 330 270 350 258 360L250 300C254 250 242 200 204 188C164 200 148 250 152 300L144 360C132 350 120 330 120 300Z', hood, 2) +
        P('M250 300C254 250 242 200 204 188C232 196 252 230 256 270C258 300 256 330 258 360C254 340 250 320 250 300Z', hs) + (f === 'sad' ? P('M152 236C170 220 236 220 252 236L250 250C230 240 172 240 154 250Z', hood) : '');
    } };

  CAST.geng = { iris: '#C49A3A', brow: '#3A3F47', hair: hairLong('#4A505A'),
    back: function () { return '<g transform="rotate(32 300 300)">' + O('M290 40h26v420h-26z', '#F0E6D2', 1.8) + P('M306 40h10v420h-10z', '#D4C8B0') + O('M286 120h34v8h-34z', '#B83A2C', 1.2) + '</g>'; },
    body: function (f, o) {
      var col = o.fire ? '#DCCDB0' : '#8C7A5B', s = torso(col);
      if (!o.fire) s += O('M200 366L150 600L250 600Z', shade(col), 1.4) + Ln('M200 366L160 600M200 366L240 600', 1, '#5A4A36', op(0.6));
      s += C(200, 410, 7, '#B89A5A', ' stroke="' + LINE + '" stroke-width="1"');
      s += '<g transform="translate(118 600) rotate(-18)">' + Ln('M0 0L4 -150M4 -110l-16 -20M2 -70l14 -18M4 -136l-10 -14', 3, '#C8CED6') + '</g>';
      if (o.magic) s += C(84, 460, 30, '#E8F0FF', op(0.35)) + C(84, 460, 5, '#FFFFFF');
      return s;
    },
    extra: function () { // 长耳
      return O('M140 236L92 206L104 222L132 252Z', SK, 1.6) + O('M260 236L308 206L296 222L268 252Z', SK, 1.6) + P('M262 240L300 214L292 226L268 248Z', SK_S);
    } };

  CAST.zhe = { iris: '#8A5A36', brow: '#1E1C22', hair: hairMessy('#22202A'),
    body: function () { var s = torso('#E8E0D2') + apron('#7A4E2E', 410); s += Ln('M88 470h40M272 470h40', 3, '#C9BCA4'); s += '<g transform="translate(286 386)">' + O('M-20 0C-18 -16 6 -20 16 -8L28 -10L22 0C24 10 8 16 -8 14Z', '#9A7A4A', 1.6) + C(12, -8, 2.2, '#F4C77A') + Ln('M-10 14v10M2 14v10', 1.6, '#3B2E26') + '</g>'; return s; },
    extra: function () { return Ln('M136 184C170 172 230 172 266 184', 4, '#5A4636') + O('M164 186m-14 0a14 12 0 1 0 28 0a14 12 0 1 0 -28 0', '#C9A24A', 1.6) + O('M236 186m-14 0a14 12 0 1 0 28 0a14 12 0 1 0 -28 0', '#C9A24A', 1.6) + C(164, 186, 8, '#A8C8D8', op(0.8)) + C(236, 186, 8, '#A8C8D8', op(0.8)); } };

  CAST.mom = { iris: '#5A4A3E', brow: '#3E3534', age: 1, hair: hairBun('#3E3534'),
    body: function (f, o) {
      var s = torso('#2E4A6B');
      s += [[130, 430], [270, 450], [110, 520], [290, 540], [150, 580], [250, 590]].map(function (p) { return C(p[0], p[1], 3, '#E8E2F0', op(0.7)); }).join('');
      s += apron(WHITE, 440);
      s += O('M150 492Q200 520 250 492L244 520Q200 540 156 520Z', '#F4EEE2', 1.6) + P('M156 492Q200 512 244 492Z', '#E8C27A') + Ln('M180 476q-6 -14 0 -26M200 474q-6 -14 0 -26M220 476q-6 -14 0 -26', 1.4, '#FFFFFF', op(0.8));
      return s;
    } };

  CAST.dad = { iris: '#4A4038', brow: '#4A4644', age: 2, hair: hairNeat('#6A6664', 10),
    body: function () {
      var s = torso('#6B5E4E') + vneck('#E4DED2', 400);
      s += O('M120 500h70v62h-70z', '#8A7A5E', 1.6) + P('M164 500h26v62h-26z', '#6E604A') + Ln('M134 500v-14M150 500v-10', 2, '#C8C0B4');
      s += '<g transform="translate(300 540)">' + O('M-14 -10h28v34h-28z', '#F4C77A', 1.6) + C(0, 7, 30, '#FFD9A0', op(0.22)) + Ln('M0 -10v-30', 2, '#3B2E26') + '</g>';
      return s;
    } };

  CAST.critic = { iris: '#3A3440', brow: '#141318', age: 1, hair: hairNeat('#141318', 16),
    body: function () { var s = torso('#1E1D24') + O('M174 368L200 470L226 368C214 362 186 362 174 368Z', WHITE, 1.6) + O('M194 384L206 384L210 470L200 486L190 470Z', '#B83A2C', 1.4) + Ln('M174 368L190 452M226 368L210 452', 1.6, '#3A3844'); return s; },
    extra: function () { return O('M224 252m-17 0a17 17 0 1 0 34 0a17 17 0 1 0 -34 0', 'none', 2) + Ln('M240 258C252 300 248 360 262 420', 1.2, '#C9A24A') + '<circle cx="224" cy="252" r="17" fill="none" stroke="#C9A24A" stroke-width="2"/>'; } };

  function build(id, f, o) {
    var c = CAST[id], iris = irisGrad(c.iris), h = hairSet(c.hair);
    var tilt = f === 'curious' ? 'rotate(-4 200 300)' : (f === 'sad' ? 'translate(0 5)' : (f === 'tired' ? 'translate(0 7)' : ''));
    var ff = f;
    if (id === 'me' && f === 'smile' && !o.after) ff = 'neutral';          // 真结局之前，韩栖笑只到嘴角
    var fc = face(ff, iris, c.brow);
    if (id === 'me' && f === 'smile' && !o.after) fc = fc.replace(MOUTH.neutral, 'M190 290q10 4 20 -2');
    var age = c.age ? Ln('M168 280q-4 12 2 22M232 280q4 12 -2 22', 1.1, SK_D, op(0.55)) + Ln('M164 266q12 4 24 0M212 266q12 4 24 0', 1, SK_D, op(c.age > 1 ? 0.55 : 0.35)) + (c.age > 1 ? Ln('M180 222q20 -4 40 0', 1, SK_D, op(0.4)) : '') : '';
    var head = ears() + O(FACE, SK, 1.8) + P(FACE_SHADE, SK_S, op(0.6)) + h.fringeShadow + fc + age;
    return '<defs>' + iris.def + '</defs>' + (c.back ? c.back(f, o) : '') +
      '<g transform="' + tilt + '">' + h.back + '</g>' + neck() + c.body(f, o) +
      '<g transform="' + tilt + '">' + head + h.front + (c.extra ? c.extra(f, o) : '') + '</g>';
  }

  var IMG = root.PORTRAIT_IMG || {};
  var FACE_ALIAS = { me_smile_before: 'soft' };
  function imgPortrait(id, f, o) {
    var have = IMG[id]; if (!have || !have.length) return '';
    if (id === 'me' && f === 'smile' && !o.after) f = FACE_ALIAS.me_smile_before;   // 真结局之前，韩栖笑不到眼睛
    if (id === 'yuan' && o.mask && have.indexOf('mask') >= 0) f = 'mask';
    if (have.indexOf(f) < 0) f = 'neutral';
    var glow = id === 'geng' && o.magic ? '<circle cx="70" cy="430" r="46" fill="#E8F0FF" opacity=".35"/><circle cx="70" cy="430" r="6" fill="#FFFFFF"/>' : '';
    return '<svg class="portrait-svg p3 p-' + id + ' f-' + f + '" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<image href="img/ch/' + id + '_' + f + '.webp" x="0" y="0" width="400" height="600" preserveAspectRatio="xMidYMax meet"/>' + glow + '</svg>';
  }

  A.portrait = function (id, f, o) {
    o = o || {};
    if (!o.alt && id !== 'wolf') { var im = imgPortrait(id, o.realsmile ? 'smile' : f, o); if (im) return im; }
    if (!CAST[id] || o.alt || id === 'wolf') return OLD(id, f, o);
    if (['neutral', 'smile', 'soft', 'curious', 'annoyed', 'angry', 'sad', 'tired', 'surprised'].indexOf(f) < 0) f = 'neutral';
    if (o.realsmile) f = 'smile';
    return '<svg class="portrait-svg p2 p-' + id + ' f-' + f + '" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + build(id, f, o) + '</svg>';
  };
  A.PORTRAIT2 = CAST;
})(typeof window !== 'undefined' ? window : this);
