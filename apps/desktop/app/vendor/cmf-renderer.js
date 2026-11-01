var Ei={LEFT:0,MIDDLE:1,RIGHT:2,ROTATE:0,DOLLY:1,PAN:2},Ci={ROTATE:0,PAN:1,DOLLY_PAN:2,DOLLY_ROTATE:3},Yh=0,tc=1,Zh=2;var Br=1,Jh=2,Vs=3,ai=0,Xe=1,Wn=2,Xn=0,Gi=1,ec=2,nc=3,ic=4,Kh=5;var bi=100,$h=101,jh=102,Qh=103,tu=104,eu=200,nu=201,iu=202,su=203,Ba=204,ka=205,ru=206,au=207,ou=208,lu=209,cu=210,hu=211,uu=212,fu=213,du=214,za=0,Va=1,Ga=2,Hi=3,Ha=4,Wa=5,Xa=6,qa=7,ho=0,pu=1,mu=2,Dn=0,sc=1,rc=2,ac=3,uo=4,oc=5,lc=6,cc=7,Ol="attached",gu="detached",hc=300,Ri=301,Qi=302,fo=303,po=304,kr=306,Wi=1e3,an=1001,As=1002,He=1003,_u=1004;var zr=1005;var Te=1006,mo=1007;var fi=1008;var ln=1009,uc=1010,fc=1011,Gs=1012,go=1013,Un=1014,qe=1015,en=1016,_o=1017,xo=1018,Hs=1020,dc=35902,pc=35899,mc=1021,gc=1022,Le=1023,Vn=1026,Pi=1027,di=1028,yo=1029,cn=1030,vo=1031;var So=1033,Vr=33776,Gr=33777,Hr=33778,Wr=33779,Mo=35840,bo=35841,wo=35842,Ao=35843,To=36196,Eo=37492,Co=37496,Ro=37488,Po=37489,Xr=37490,Io=37491,Do=37808,Uo=37809,Lo=37810,No=37811,Fo=37812,Oo=37813,Bo=37814,ko=37815,zo=37816,Vo=37817,Go=37818,Ho=37819,Wo=37820,Xo=37821,qo=36492,Yo=36494,Zo=36495,Jo=36283,Ko=36284,qr=36285,$o=36286;var cr=2300,Ya=2301,Oa=2302,Bl=2303,kl=2400,zl=2401,Vl=2402,xu=2500;var yu=3200;var Yr=0,vu=1,Ye="",pe="srgb",pn="srgb-linear",hr="linear",me="srgb";var zi=7680;var Gl=519,Su=512,Mu=513,bu=514,jo=515,wu=516,Au=517,Qo=518,Tu=519,Hl=35044;var _c="300 es",Cn=2e3,Ts=2001;function Lf(i){for(let t=i.length-1;t>=0;--t)if(i[t]>=65535)return!0;return!1}function Nf(i){return ArrayBuffer.isView(i)&&!(i instanceof DataView)}function ur(i){return document.createElementNS("http://www.w3.org/1999/xhtml",i)}function Eu(){let i=ur("canvas");return i.style.display="block",i}var ph={},Es=null;function xc(...i){let t="THREE."+i.shift();Es?Es("log",t,...i):console.log(t,...i)}function Cu(i){let t=i[0];if(typeof t=="string"&&t.startsWith("TSL:")){let e=i[1];e&&e.isStackTrace?i[0]+=" "+e.getLocation():i[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return i}function Jt(...i){i=Cu(i);let t="THREE."+i.shift();if(Es)Es("warn",t,...i);else{let e=i[0];e&&e.isStackTrace?console.warn(e.getError(t)):console.warn(t,...i)}}function jt(...i){i=Cu(i);let t="THREE."+i.shift();if(Es)Es("error",t,...i);else{let e=i[0];e&&e.isStackTrace?console.error(e.getError(t)):console.error(t,...i)}}function Vi(...i){let t=i.join(" ");t in ph||(ph[t]=!0,Jt(...i))}function Ru(i,t,e){return new Promise(function(n,s){function r(){switch(i.clientWaitSync(t,i.SYNC_FLUSH_COMMANDS_BIT,0)){case i.WAIT_FAILED:s();break;case i.TIMEOUT_EXPIRED:setTimeout(r,e);break;default:n()}}setTimeout(r,e)})}var Pu={[za]:Va,[Ga]:Xa,[Ha]:qa,[Hi]:Wa,[Va]:za,[Xa]:Ga,[qa]:Ha,[Wa]:Hi},Rn=class{addEventListener(t,e){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[t]===void 0&&(n[t]=[]),n[t].indexOf(e)===-1&&n[t].push(e)}hasEventListener(t,e){let n=this._listeners;return n===void 0?!1:n[t]!==void 0&&n[t].indexOf(e)!==-1}removeEventListener(t,e){let n=this._listeners;if(n===void 0)return;let s=n[t];if(s!==void 0){let r=s.indexOf(e);r!==-1&&s.splice(r,1)}}dispatchEvent(t){let e=this._listeners;if(e===void 0)return;let n=e[t.type];if(n!==void 0){t.target=this;let s=n.slice(0);for(let r=0,a=s.length;r<a;r++)s[r].call(this,t);t.target=null}}},$e=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],mh=1234567,or=Math.PI/180,Xi=180/Math.PI;function Ii(){let i=Math.random()*4294967295|0,t=Math.random()*4294967295|0,e=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return($e[i&255]+$e[i>>8&255]+$e[i>>16&255]+$e[i>>24&255]+"-"+$e[t&255]+$e[t>>8&255]+"-"+$e[t>>16&15|64]+$e[t>>24&255]+"-"+$e[e&63|128]+$e[e>>8&255]+"-"+$e[e>>16&255]+$e[e>>24&255]+$e[n&255]+$e[n>>8&255]+$e[n>>16&255]+$e[n>>24&255]).toLowerCase()}function ae(i,t,e){return Math.max(t,Math.min(e,i))}function yc(i,t){return(i%t+t)%t}function Ff(i,t,e,n,s){return n+(i-t)*(s-n)/(e-t)}function Of(i,t,e){return i!==t?(e-i)/(t-i):0}function lr(i,t,e){return(1-e)*i+e*t}function Bf(i,t,e,n){return lr(i,t,1-Math.exp(-e*n))}function kf(i,t=1){return t-Math.abs(yc(i,t*2)-t)}function zf(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*(3-2*i))}function Vf(i,t,e){return i<=t?0:i>=e?1:(i=(i-t)/(e-t),i*i*i*(i*(i*6-15)+10))}function Gf(i,t){return i+Math.floor(Math.random()*(t-i+1))}function Hf(i,t){return i+Math.random()*(t-i)}function Wf(i){return i*(.5-Math.random())}function Xf(i){i!==void 0&&(mh=i);let t=mh+=1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}function qf(i){return i*or}function Yf(i){return i*Xi}function Zf(i){return(i&i-1)===0&&i!==0}function Jf(i){return Math.pow(2,Math.ceil(Math.log(i)/Math.LN2))}function Kf(i){return Math.pow(2,Math.floor(Math.log(i)/Math.LN2))}function $f(i,t,e,n,s){let r=Math.cos,a=Math.sin,o=r(e/2),l=a(e/2),c=r((t+n)/2),f=a((t+n)/2),u=r((t-n)/2),d=a((t-n)/2),p=r((n-t)/2),g=a((n-t)/2);switch(s){case"XYX":i.set(o*f,l*u,l*d,o*c);break;case"YZY":i.set(l*d,o*f,l*u,o*c);break;case"ZXZ":i.set(l*u,l*d,o*f,o*c);break;case"XZX":i.set(o*f,l*g,l*p,o*c);break;case"YXY":i.set(l*p,o*f,l*g,o*c);break;case"ZYZ":i.set(l*g,l*p,o*f,o*c);break;default:Jt("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function bs(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return i/4294967295;case Uint16Array:return i/65535;case Uint8Array:return i/255;case Int32Array:return Math.max(i/2147483647,-1);case Int16Array:return Math.max(i/32767,-1);case Int8Array:return Math.max(i/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function sn(i,t){switch(t.constructor){case Float32Array:return i;case Uint32Array:return Math.round(i*4294967295);case Uint16Array:return Math.round(i*65535);case Uint8Array:return Math.round(i*255);case Int32Array:return Math.round(i*2147483647);case Int16Array:return Math.round(i*32767);case Int8Array:return Math.round(i*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}var vc={DEG2RAD:or,RAD2DEG:Xi,generateUUID:Ii,clamp:ae,euclideanModulo:yc,mapLinear:Ff,inverseLerp:Of,lerp:lr,damp:Bf,pingpong:kf,smoothstep:zf,smootherstep:Vf,randInt:Gf,randFloat:Hf,randFloatSpread:Wf,seededRandom:Xf,degToRad:qf,radToDeg:Yf,isPowerOfTwo:Zf,ceilPowerOfTwo:Jf,floorPowerOfTwo:Kf,setQuaternionFromProperEuler:$f,normalize:sn,denormalize:bs},Ac=class Ac{constructor(t=0,e=0){this.x=t,this.y=e}get width(){return this.x}set width(t){this.x=t}get height(){return this.y}set height(t){this.y=t}set(t,e){return this.x=t,this.y=e,this}setScalar(t){return this.x=t,this.y=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;default:throw new Error("THREE.Vector2: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y)}copy(t){return this.x=t.x,this.y=t.y,this}add(t){return this.x+=t.x,this.y+=t.y,this}addScalar(t){return this.x+=t,this.y+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this}subScalar(t){return this.x-=t,this.y-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this}multiply(t){return this.x*=t.x,this.y*=t.y,this}multiplyScalar(t){return this.x*=t,this.y*=t,this}divide(t){return this.x/=t.x,this.y/=t.y,this}divideScalar(t){return this.multiplyScalar(1/t)}applyMatrix3(t){let e=this.x,n=this.y,s=t.elements;return this.x=s[0]*e+s[3]*n+s[6],this.y=s[1]*e+s[4]*n+s[7],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this}clamp(t,e){return this.x=ae(this.x,t.x,e.x),this.y=ae(this.y,t.y,e.y),this}clampScalar(t,e){return this.x=ae(this.x,t,e),this.y=ae(this.y,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ae(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(t){return this.x*t.x+this.y*t.y}cross(t){return this.x*t.y-this.y*t.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(ae(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y;return e*e+n*n}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this}equals(t){return t.x===this.x&&t.y===this.y}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this}rotateAround(t,e){let n=Math.cos(e),s=Math.sin(e),r=this.x-t.x,a=this.y-t.y;return this.x=r*n-a*s+t.x,this.y=r*s+a*n+t.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};Ac.prototype.isVector2=!0;var Kt=Ac,We=class{constructor(t=0,e=0,n=0,s=1){this.isQuaternion=!0,this._x=t,this._y=e,this._z=n,this._w=s}static slerpFlat(t,e,n,s,r,a,o){let l=n[s+0],c=n[s+1],f=n[s+2],u=n[s+3],d=r[a+0],p=r[a+1],g=r[a+2],y=r[a+3];if(u!==y||l!==d||c!==p||f!==g){let m=l*d+c*p+f*g+u*y;m<0&&(d=-d,p=-p,g=-g,y=-y,m=-m);let _=1-o;if(m<.9995){let R=Math.acos(m),w=Math.sin(R);_=Math.sin(_*R)/w,o=Math.sin(o*R)/w,l=l*_+d*o,c=c*_+p*o,f=f*_+g*o,u=u*_+y*o}else{l=l*_+d*o,c=c*_+p*o,f=f*_+g*o,u=u*_+y*o;let R=1/Math.sqrt(l*l+c*c+f*f+u*u);l*=R,c*=R,f*=R,u*=R}}t[e]=l,t[e+1]=c,t[e+2]=f,t[e+3]=u}static multiplyQuaternionsFlat(t,e,n,s,r,a){let o=n[s],l=n[s+1],c=n[s+2],f=n[s+3],u=r[a],d=r[a+1],p=r[a+2],g=r[a+3];return t[e]=o*g+f*u+l*p-c*d,t[e+1]=l*g+f*d+c*u-o*p,t[e+2]=c*g+f*p+o*d-l*u,t[e+3]=f*g-o*u-l*d-c*p,t}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get w(){return this._w}set w(t){this._w=t,this._onChangeCallback()}set(t,e,n,s){return this._x=t,this._y=e,this._z=n,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(t){return this._x=t.x,this._y=t.y,this._z=t.z,this._w=t.w,this._onChangeCallback(),this}setFromEuler(t,e=!0){let n=t._x,s=t._y,r=t._z,a=t._order,o=Math.cos,l=Math.sin,c=o(n/2),f=o(s/2),u=o(r/2),d=l(n/2),p=l(s/2),g=l(r/2);switch(a){case"XYZ":this._x=d*f*u+c*p*g,this._y=c*p*u-d*f*g,this._z=c*f*g+d*p*u,this._w=c*f*u-d*p*g;break;case"YXZ":this._x=d*f*u+c*p*g,this._y=c*p*u-d*f*g,this._z=c*f*g-d*p*u,this._w=c*f*u+d*p*g;break;case"ZXY":this._x=d*f*u-c*p*g,this._y=c*p*u+d*f*g,this._z=c*f*g+d*p*u,this._w=c*f*u-d*p*g;break;case"ZYX":this._x=d*f*u-c*p*g,this._y=c*p*u+d*f*g,this._z=c*f*g-d*p*u,this._w=c*f*u+d*p*g;break;case"YZX":this._x=d*f*u+c*p*g,this._y=c*p*u+d*f*g,this._z=c*f*g-d*p*u,this._w=c*f*u-d*p*g;break;case"XZY":this._x=d*f*u-c*p*g,this._y=c*p*u-d*f*g,this._z=c*f*g+d*p*u,this._w=c*f*u+d*p*g;break;default:Jt("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return e===!0&&this._onChangeCallback(),this}setFromAxisAngle(t,e){let n=e/2,s=Math.sin(n);return this._x=t.x*s,this._y=t.y*s,this._z=t.z*s,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(t){let e=t.elements,n=e[0],s=e[4],r=e[8],a=e[1],o=e[5],l=e[9],c=e[2],f=e[6],u=e[10],d=n+o+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(f-l)*p,this._y=(r-c)*p,this._z=(a-s)*p}else if(n>o&&n>u){let p=2*Math.sqrt(1+n-o-u);this._w=(f-l)/p,this._x=.25*p,this._y=(s+a)/p,this._z=(r+c)/p}else if(o>u){let p=2*Math.sqrt(1+o-n-u);this._w=(r-c)/p,this._x=(s+a)/p,this._y=.25*p,this._z=(l+f)/p}else{let p=2*Math.sqrt(1+u-n-o);this._w=(a-s)/p,this._x=(r+c)/p,this._y=(l+f)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(t,e){let n=t.dot(e)+1;return n<1e-8?(n=0,Math.abs(t.x)>Math.abs(t.z)?(this._x=-t.y,this._y=t.x,this._z=0,this._w=n):(this._x=0,this._y=-t.z,this._z=t.y,this._w=n)):(this._x=t.y*e.z-t.z*e.y,this._y=t.z*e.x-t.x*e.z,this._z=t.x*e.y-t.y*e.x,this._w=n),this.normalize()}angleTo(t){return 2*Math.acos(Math.abs(ae(this.dot(t),-1,1)))}rotateTowards(t,e){let n=this.angleTo(t);if(n===0)return this;let s=Math.min(1,e/n);return this.slerp(t,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(t){return this._x*t._x+this._y*t._y+this._z*t._z+this._w*t._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let t=this.length();return t===0?(this._x=0,this._y=0,this._z=0,this._w=1):(t=1/t,this._x=this._x*t,this._y=this._y*t,this._z=this._z*t,this._w=this._w*t),this._onChangeCallback(),this}multiply(t){return this.multiplyQuaternions(this,t)}premultiply(t){return this.multiplyQuaternions(t,this)}multiplyQuaternions(t,e){let n=t._x,s=t._y,r=t._z,a=t._w,o=e._x,l=e._y,c=e._z,f=e._w;return this._x=n*f+a*o+s*c-r*l,this._y=s*f+a*l+r*o-n*c,this._z=r*f+a*c+n*l-s*o,this._w=a*f-n*o-s*l-r*c,this._onChangeCallback(),this}slerp(t,e){let n=t._x,s=t._y,r=t._z,a=t._w,o=this.dot(t);o<0&&(n=-n,s=-s,r=-r,a=-a,o=-o);let l=1-e;if(o<.9995){let c=Math.acos(o),f=Math.sin(c);l=Math.sin(l*c)/f,e=Math.sin(e*c)/f,this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this._onChangeCallback()}else this._x=this._x*l+n*e,this._y=this._y*l+s*e,this._z=this._z*l+r*e,this._w=this._w*l+a*e,this.normalize();return this}slerpQuaternions(t,e,n){return this.copy(t).slerp(e,n)}random(){let t=2*Math.PI*Math.random(),e=2*Math.PI*Math.random(),n=Math.random(),s=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(s*Math.sin(t),s*Math.cos(t),r*Math.sin(e),r*Math.cos(e))}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._w===this._w}fromArray(t,e=0){return this._x=t[e],this._y=t[e+1],this._z=t[e+2],this._w=t[e+3],this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._w,t}fromBufferAttribute(t,e){return this._x=t.getX(e),this._y=t.getY(e),this._z=t.getZ(e),this._w=t.getW(e),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},Tc=class Tc{constructor(t=0,e=0,n=0){this.x=t,this.y=e,this.z=n}set(t,e,n){return n===void 0&&(n=this.z),this.x=t,this.y=e,this.z=n,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;default:throw new Error("THREE.Vector3: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this}multiplyVectors(t,e){return this.x=t.x*e.x,this.y=t.y*e.y,this.z=t.z*e.z,this}applyEuler(t){return this.applyQuaternion(gh.setFromEuler(t))}applyAxisAngle(t,e){return this.applyQuaternion(gh.setFromAxisAngle(t,e))}applyMatrix3(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[3]*n+r[6]*s,this.y=r[1]*e+r[4]*n+r[7]*s,this.z=r[2]*e+r[5]*n+r[8]*s,this}applyNormalMatrix(t){return this.applyMatrix3(t).normalize()}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=t.elements,a=1/(r[3]*e+r[7]*n+r[11]*s+r[15]);return this.x=(r[0]*e+r[4]*n+r[8]*s+r[12])*a,this.y=(r[1]*e+r[5]*n+r[9]*s+r[13])*a,this.z=(r[2]*e+r[6]*n+r[10]*s+r[14])*a,this}applyQuaternion(t){let e=this.x,n=this.y,s=this.z,r=t.x,a=t.y,o=t.z,l=t.w,c=2*(a*s-o*n),f=2*(o*e-r*s),u=2*(r*n-a*e);return this.x=e+l*c+a*u-o*f,this.y=n+l*f+o*c-r*u,this.z=s+l*u+r*f-a*c,this}project(t){return this.applyMatrix4(t.matrixWorldInverse).applyMatrix4(t.projectionMatrix)}unproject(t){return this.applyMatrix4(t.projectionMatrixInverse).applyMatrix4(t.matrixWorld)}transformDirection(t){let e=this.x,n=this.y,s=this.z,r=t.elements;return this.x=r[0]*e+r[4]*n+r[8]*s,this.y=r[1]*e+r[5]*n+r[9]*s,this.z=r[2]*e+r[6]*n+r[10]*s,this.normalize()}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this}divideScalar(t){return this.multiplyScalar(1/t)}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this}clamp(t,e){return this.x=ae(this.x,t.x,e.x),this.y=ae(this.y,t.y,e.y),this.z=ae(this.z,t.z,e.z),this}clampScalar(t,e){return this.x=ae(this.x,t,e),this.y=ae(this.y,t,e),this.z=ae(this.z,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ae(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this}cross(t){return this.crossVectors(this,t)}crossVectors(t,e){let n=t.x,s=t.y,r=t.z,a=e.x,o=e.y,l=e.z;return this.x=s*l-r*o,this.y=r*a-n*l,this.z=n*o-s*a,this}projectOnVector(t){let e=t.lengthSq();if(e===0)return this.set(0,0,0);let n=t.dot(this)/e;return this.copy(t).multiplyScalar(n)}projectOnPlane(t){return dl.copy(this).projectOnVector(t),this.sub(dl)}reflect(t){return this.sub(dl.copy(t).multiplyScalar(2*this.dot(t)))}angleTo(t){let e=Math.sqrt(this.lengthSq()*t.lengthSq());if(e===0)return Math.PI/2;let n=this.dot(t)/e;return Math.acos(ae(n,-1,1))}distanceTo(t){return Math.sqrt(this.distanceToSquared(t))}distanceToSquared(t){let e=this.x-t.x,n=this.y-t.y,s=this.z-t.z;return e*e+n*n+s*s}manhattanDistanceTo(t){return Math.abs(this.x-t.x)+Math.abs(this.y-t.y)+Math.abs(this.z-t.z)}setFromSpherical(t){return this.setFromSphericalCoords(t.radius,t.phi,t.theta)}setFromSphericalCoords(t,e,n){let s=Math.sin(e)*t;return this.x=s*Math.sin(n),this.y=Math.cos(e)*t,this.z=s*Math.cos(n),this}setFromCylindrical(t){return this.setFromCylindricalCoords(t.radius,t.theta,t.y)}setFromCylindricalCoords(t,e,n){return this.x=t*Math.sin(e),this.y=n,this.z=t*Math.cos(e),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this}setFromMatrixScale(t){let e=this.setFromMatrixColumn(t,0).length(),n=this.setFromMatrixColumn(t,1).length(),s=this.setFromMatrixColumn(t,2).length();return this.x=e,this.y=n,this.z=s,this}setFromMatrixColumn(t,e){return this.fromArray(t.elements,e*4)}setFromMatrix3Column(t,e){return this.fromArray(t.elements,e*3)}setFromEuler(t){return this.x=t._x,this.y=t._y,this.z=t._z,this}setFromColor(t){return this.x=t.r,this.y=t.g,this.z=t.b,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let t=Math.random()*Math.PI*2,e=Math.random()*2-1,n=Math.sqrt(1-e*e);return this.x=n*Math.cos(t),this.y=e,this.z=n*Math.sin(t),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};Tc.prototype.isVector3=!0;var H=Tc,dl=new H,gh=new We,Ec=class Ec{constructor(t,e,n,s,r,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,l,c)}set(t,e,n,s,r,a,o,l,c){let f=this.elements;return f[0]=t,f[1]=s,f[2]=o,f[3]=e,f[4]=r,f[5]=l,f[6]=n,f[7]=a,f[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],this}extractBasis(t,e,n){return t.setFromMatrix3Column(this,0),e.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(t){let e=t.elements;return this.set(e[0],e[4],e[8],e[1],e[5],e[9],e[2],e[6],e[10]),this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[3],l=n[6],c=n[1],f=n[4],u=n[7],d=n[2],p=n[5],g=n[8],y=s[0],m=s[3],_=s[6],R=s[1],w=s[4],v=s[7],E=s[2],C=s[5],D=s[8];return r[0]=a*y+o*R+l*E,r[3]=a*m+o*w+l*C,r[6]=a*_+o*v+l*D,r[1]=c*y+f*R+u*E,r[4]=c*m+f*w+u*C,r[7]=c*_+f*v+u*D,r[2]=d*y+p*R+g*E,r[5]=d*m+p*w+g*C,r[8]=d*_+p*v+g*D,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[3]*=t,e[6]*=t,e[1]*=t,e[4]*=t,e[7]*=t,e[2]*=t,e[5]*=t,e[8]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],f=t[8];return e*a*f-e*o*c-n*r*f+n*o*l+s*r*c-s*a*l}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],f=t[8],u=f*a-o*c,d=o*l-f*r,p=c*r-a*l,g=e*u+n*d+s*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let y=1/g;return t[0]=u*y,t[1]=(s*c-f*n)*y,t[2]=(o*n-s*a)*y,t[3]=d*y,t[4]=(f*e-s*l)*y,t[5]=(s*r-o*e)*y,t[6]=p*y,t[7]=(n*l-c*e)*y,t[8]=(a*e-n*r)*y,this}transpose(){let t,e=this.elements;return t=e[1],e[1]=e[3],e[3]=t,t=e[2],e[2]=e[6],e[6]=t,t=e[5],e[5]=e[7],e[7]=t,this}getNormalMatrix(t){return this.setFromMatrix4(t).invert().transpose()}transposeIntoArray(t){let e=this.elements;return t[0]=e[0],t[1]=e[3],t[2]=e[6],t[3]=e[1],t[4]=e[4],t[5]=e[7],t[6]=e[2],t[7]=e[5],t[8]=e[8],this}setUvTransform(t,e,n,s,r,a,o){let l=Math.cos(r),c=Math.sin(r);return this.set(n*l,n*c,-n*(l*a+c*o)+a+t,-s*c,s*l,-s*(-c*a+l*o)+o+e,0,0,1),this}scale(t,e){return Vi("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(pl.makeScale(t,e)),this}rotate(t){return Vi("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(pl.makeRotation(-t)),this}translate(t,e){return Vi("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(pl.makeTranslation(t,e)),this}makeTranslation(t,e){return t.isVector2?this.set(1,0,t.x,0,1,t.y,0,0,1):this.set(1,0,t,0,1,e,0,0,1),this}makeRotation(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,n,e,0,0,0,1),this}makeScale(t,e){return this.set(t,0,0,0,e,0,0,0,1),this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<9;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<9;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t}clone(){return new this.constructor().fromArray(this.elements)}};Ec.prototype.isMatrix3=!0;var ne=Ec,pl=new ne,_h=new ne().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),xh=new ne().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function jf(){let i={enabled:!0,workingColorSpace:pn,spaces:{},convert:function(s,r,a){return this.enabled===!1||r===a||!r||!a||(this.spaces[r].transfer===me&&(s.r=ri(s.r),s.g=ri(s.g),s.b=ri(s.b)),this.spaces[r].primaries!==this.spaces[a].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===me&&(s.r=ws(s.r),s.g=ws(s.g),s.b=ws(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Ye?hr:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,a){return s.copy(this.spaces[r].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(s,r){return Vi("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),i.workingToColorSpace(s,r)},toWorkingColorSpace:function(s,r){return Vi("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),i.colorSpaceToWorking(s,r)}},t=[.64,.33,.3,.6,.15,.06],e=[.2126,.7152,.0722],n=[.3127,.329];return i.define({[pn]:{primaries:t,whitePoint:n,transfer:hr,toXYZ:_h,fromXYZ:xh,luminanceCoefficients:e,workingColorSpaceConfig:{unpackColorSpace:pe},outputColorSpaceConfig:{drawingBufferColorSpace:pe}},[pe]:{primaries:t,whitePoint:n,transfer:me,toXYZ:_h,fromXYZ:xh,luminanceCoefficients:e,outputColorSpaceConfig:{drawingBufferColorSpace:pe}}}),i}var ce=jf();function ri(i){return i<.04045?i*.0773993808:Math.pow(i*.9478672986+.0521327014,2.4)}function ws(i){return i<.0031308?i*12.92:1.055*Math.pow(i,.41666)-.055}var hs,Za=class{static getDataURL(t,e="image/png"){if(/^data:/i.test(t.src)||typeof HTMLCanvasElement>"u")return t.src;let n;if(t instanceof HTMLCanvasElement)n=t;else{hs===void 0&&(hs=ur("canvas")),hs.width=t.width,hs.height=t.height;let s=hs.getContext("2d");t instanceof ImageData?s.putImageData(t,0,0):s.drawImage(t,0,0,t.width,t.height),n=hs}return n.toDataURL(e)}static sRGBToLinear(t){if(typeof HTMLImageElement<"u"&&t instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&t instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&t instanceof ImageBitmap){let e=ur("canvas");e.width=t.width,e.height=t.height;let n=e.getContext("2d");n.drawImage(t,0,0,t.width,t.height);let s=n.getImageData(0,0,t.width,t.height),r=s.data;for(let a=0;a<r.length;a++)r[a]=ri(r[a]/255)*255;return n.putImageData(s,0,0),e}else if(t.data){let e=t.data.slice(0);for(let n=0;n<e.length;n++)e instanceof Uint8Array||e instanceof Uint8ClampedArray?e[n]=Math.floor(ri(e[n]/255)*255):e[n]=ri(e[n]);return{data:e,width:t.width,height:t.height}}else return Jt("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),t}},Qf=0,Cs=class{constructor(t=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Qf++}),this.uuid=Ii(),this.data=t,this.dataReady=!0,this.version=0}getSize(t){let e=this.data;return typeof HTMLVideoElement<"u"&&e instanceof HTMLVideoElement?t.set(e.videoWidth,e.videoHeight,0):typeof VideoFrame<"u"&&e instanceof VideoFrame?t.set(e.displayWidth,e.displayHeight,0):e!==null?t.set(e.width,e.height,e.depth||0):t.set(0,0,0),t}set needsUpdate(t){t===!0&&this.version++}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.images[this.uuid]!==void 0)return t.images[this.uuid];let n={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let a=0,o=s.length;a<o;a++)s[a].isDataTexture?r.push(ml(s[a].image)):r.push(ml(s[a]))}else r=ml(s);n.url=r}return e||(t.images[this.uuid]=n),n}};function ml(i){return typeof HTMLImageElement<"u"&&i instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&i instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&i instanceof ImageBitmap?Za.getDataURL(i):i.data?{data:Array.from(i.data),width:i.width,height:i.height,type:i.data.constructor.name}:(Jt("Texture: Unable to serialize Texture."),{})}var td=0,gl=new H,Qe=class i extends Rn{constructor(t=i.DEFAULT_IMAGE,e=i.DEFAULT_MAPPING,n=an,s=an,r=Te,a=fi,o=Le,l=ln,c=i.DEFAULT_ANISOTROPY,f=Ye){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:td++}),this.uuid=Ii(),this.name="",this.source=new Cs(t),this.mipmaps=[],this.mapping=e,this.channel=0,this.wrapS=n,this.wrapT=s,this.magFilter=r,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Kt(0,0),this.repeat=new Kt(1,1),this.center=new Kt(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ne,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=f,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(t&&t.depth&&t.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(gl).x}get height(){return this.source.getSize(gl).y}get depth(){return this.source.getSize(gl).z}get image(){return this.source.data}set image(t){this.source.data=t}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(t){return this.name=t.name,this.source=t.source,this.mipmaps=t.mipmaps.slice(0),this.mapping=t.mapping,this.channel=t.channel,this.wrapS=t.wrapS,this.wrapT=t.wrapT,this.magFilter=t.magFilter,this.minFilter=t.minFilter,this.anisotropy=t.anisotropy,this.format=t.format,this.internalFormat=t.internalFormat,this.type=t.type,this.normalized=t.normalized,this.offset.copy(t.offset),this.repeat.copy(t.repeat),this.center.copy(t.center),this.rotation=t.rotation,this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrix.copy(t.matrix),this.generateMipmaps=t.generateMipmaps,this.premultiplyAlpha=t.premultiplyAlpha,this.flipY=t.flipY,this.unpackAlignment=t.unpackAlignment,this.colorSpace=t.colorSpace,this.renderTarget=t.renderTarget,this.isRenderTargetTexture=t.isRenderTargetTexture,this.isArrayTexture=t.isArrayTexture,this.userData=JSON.parse(JSON.stringify(t.userData)),this.needsUpdate=!0,this}setValues(t){for(let e in t){let n=t[e];if(n===void 0){Jt(`Texture.setValues(): parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Jt(`Texture.setValues(): property '${e}' does not exist.`);continue}s&&n&&s.isVector2&&n.isVector2||s&&n&&s.isVector3&&n.isVector3||s&&n&&s.isMatrix3&&n.isMatrix3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";if(!e&&t.textures[this.uuid]!==void 0)return t.textures[this.uuid];let n={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(t).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),e||(t.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(t){if(this.mapping!==hc)return t;if(t.applyMatrix3(this.matrix),t.x<0||t.x>1)switch(this.wrapS){case Wi:t.x=t.x-Math.floor(t.x);break;case an:t.x=t.x<0?0:1;break;case As:Math.abs(Math.floor(t.x)%2)===1?t.x=Math.ceil(t.x)-t.x:t.x=t.x-Math.floor(t.x);break}if(t.y<0||t.y>1)switch(this.wrapT){case Wi:t.y=t.y-Math.floor(t.y);break;case an:t.y=t.y<0?0:1;break;case As:Math.abs(Math.floor(t.y)%2)===1?t.y=Math.ceil(t.y)-t.y:t.y=t.y-Math.floor(t.y);break}return this.flipY&&(t.y=1-t.y),t}set needsUpdate(t){t===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(t){t===!0&&this.pmremVersion++}};Qe.DEFAULT_IMAGE=null;Qe.DEFAULT_MAPPING=hc;Qe.DEFAULT_ANISOTROPY=1;var Cc=class Cc{constructor(t=0,e=0,n=0,s=1){this.x=t,this.y=e,this.z=n,this.w=s}get width(){return this.z}set width(t){this.z=t}get height(){return this.w}set height(t){this.w=t}set(t,e,n,s){return this.x=t,this.y=e,this.z=n,this.w=s,this}setScalar(t){return this.x=t,this.y=t,this.z=t,this.w=t,this}setX(t){return this.x=t,this}setY(t){return this.y=t,this}setZ(t){return this.z=t,this}setW(t){return this.w=t,this}setComponent(t,e){switch(t){case 0:this.x=e;break;case 1:this.y=e;break;case 2:this.z=e;break;case 3:this.w=e;break;default:throw new Error("THREE.Vector4: index is out of range: "+t)}return this}getComponent(t){switch(t){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+t)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(t){return this.x=t.x,this.y=t.y,this.z=t.z,this.w=t.w!==void 0?t.w:1,this}add(t){return this.x+=t.x,this.y+=t.y,this.z+=t.z,this.w+=t.w,this}addScalar(t){return this.x+=t,this.y+=t,this.z+=t,this.w+=t,this}addVectors(t,e){return this.x=t.x+e.x,this.y=t.y+e.y,this.z=t.z+e.z,this.w=t.w+e.w,this}addScaledVector(t,e){return this.x+=t.x*e,this.y+=t.y*e,this.z+=t.z*e,this.w+=t.w*e,this}sub(t){return this.x-=t.x,this.y-=t.y,this.z-=t.z,this.w-=t.w,this}subScalar(t){return this.x-=t,this.y-=t,this.z-=t,this.w-=t,this}subVectors(t,e){return this.x=t.x-e.x,this.y=t.y-e.y,this.z=t.z-e.z,this.w=t.w-e.w,this}multiply(t){return this.x*=t.x,this.y*=t.y,this.z*=t.z,this.w*=t.w,this}multiplyScalar(t){return this.x*=t,this.y*=t,this.z*=t,this.w*=t,this}applyMatrix4(t){let e=this.x,n=this.y,s=this.z,r=this.w,a=t.elements;return this.x=a[0]*e+a[4]*n+a[8]*s+a[12]*r,this.y=a[1]*e+a[5]*n+a[9]*s+a[13]*r,this.z=a[2]*e+a[6]*n+a[10]*s+a[14]*r,this.w=a[3]*e+a[7]*n+a[11]*s+a[15]*r,this}divide(t){return this.x/=t.x,this.y/=t.y,this.z/=t.z,this.w/=t.w,this}divideScalar(t){return this.multiplyScalar(1/t)}setAxisAngleFromQuaternion(t){this.w=2*Math.acos(t.w);let e=Math.sqrt(1-t.w*t.w);return e<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=t.x/e,this.y=t.y/e,this.z=t.z/e),this}setAxisAngleFromRotationMatrix(t){let e,n,s,r,l=t.elements,c=l[0],f=l[4],u=l[8],d=l[1],p=l[5],g=l[9],y=l[2],m=l[6],_=l[10];if(Math.abs(f-d)<.01&&Math.abs(u-y)<.01&&Math.abs(g-m)<.01){if(Math.abs(f+d)<.1&&Math.abs(u+y)<.1&&Math.abs(g+m)<.1&&Math.abs(c+p+_-3)<.1)return this.set(1,0,0,0),this;e=Math.PI;let w=(c+1)/2,v=(p+1)/2,E=(_+1)/2,C=(f+d)/4,D=(u+y)/4,S=(g+m)/4;return w>v&&w>E?w<.01?(n=0,s=.707106781,r=.707106781):(n=Math.sqrt(w),s=C/n,r=D/n):v>E?v<.01?(n=.707106781,s=0,r=.707106781):(s=Math.sqrt(v),n=C/s,r=S/s):E<.01?(n=.707106781,s=.707106781,r=0):(r=Math.sqrt(E),n=D/r,s=S/r),this.set(n,s,r,e),this}let R=Math.sqrt((m-g)*(m-g)+(u-y)*(u-y)+(d-f)*(d-f));return Math.abs(R)<.001&&(R=1),this.x=(m-g)/R,this.y=(u-y)/R,this.z=(d-f)/R,this.w=Math.acos((c+p+_-1)/2),this}setFromMatrixPosition(t){let e=t.elements;return this.x=e[12],this.y=e[13],this.z=e[14],this.w=e[15],this}min(t){return this.x=Math.min(this.x,t.x),this.y=Math.min(this.y,t.y),this.z=Math.min(this.z,t.z),this.w=Math.min(this.w,t.w),this}max(t){return this.x=Math.max(this.x,t.x),this.y=Math.max(this.y,t.y),this.z=Math.max(this.z,t.z),this.w=Math.max(this.w,t.w),this}clamp(t,e){return this.x=ae(this.x,t.x,e.x),this.y=ae(this.y,t.y,e.y),this.z=ae(this.z,t.z,e.z),this.w=ae(this.w,t.w,e.w),this}clampScalar(t,e){return this.x=ae(this.x,t,e),this.y=ae(this.y,t,e),this.z=ae(this.z,t,e),this.w=ae(this.w,t,e),this}clampLength(t,e){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ae(n,t,e))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(t){return this.x*t.x+this.y*t.y+this.z*t.z+this.w*t.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(t){return this.normalize().multiplyScalar(t)}lerp(t,e){return this.x+=(t.x-this.x)*e,this.y+=(t.y-this.y)*e,this.z+=(t.z-this.z)*e,this.w+=(t.w-this.w)*e,this}lerpVectors(t,e,n){return this.x=t.x+(e.x-t.x)*n,this.y=t.y+(e.y-t.y)*n,this.z=t.z+(e.z-t.z)*n,this.w=t.w+(e.w-t.w)*n,this}equals(t){return t.x===this.x&&t.y===this.y&&t.z===this.z&&t.w===this.w}fromArray(t,e=0){return this.x=t[e],this.y=t[e+1],this.z=t[e+2],this.w=t[e+3],this}toArray(t=[],e=0){return t[e]=this.x,t[e+1]=this.y,t[e+2]=this.z,t[e+3]=this.w,t}fromBufferAttribute(t,e){return this.x=t.getX(e),this.y=t.getY(e),this.z=t.getZ(e),this.w=t.getW(e),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};Cc.prototype.isVector4=!0;var ge=Cc,Ja=class extends Rn{constructor(t=1,e=1,n={}){super(),n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Te,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},n),this.isRenderTarget=!0,this.width=t,this.height=e,this.depth=n.depth,this.scissor=new ge(0,0,t,e),this.scissorTest=!1,this.viewport=new ge(0,0,t,e),this.textures=[];let s={width:t,height:e,depth:n.depth},r=new Qe(s),a=n.count;for(let o=0;o<a;o++)this.textures[o]=r.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(n),this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples,this.multiview=n.multiview,this.useArrayDepthTexture=n.useArrayDepthTexture}_setTextureOptions(t={}){let e={minFilter:Te,generateMipmaps:!1,flipY:!1,internalFormat:null};t.mapping!==void 0&&(e.mapping=t.mapping),t.wrapS!==void 0&&(e.wrapS=t.wrapS),t.wrapT!==void 0&&(e.wrapT=t.wrapT),t.wrapR!==void 0&&(e.wrapR=t.wrapR),t.magFilter!==void 0&&(e.magFilter=t.magFilter),t.minFilter!==void 0&&(e.minFilter=t.minFilter),t.format!==void 0&&(e.format=t.format),t.type!==void 0&&(e.type=t.type),t.anisotropy!==void 0&&(e.anisotropy=t.anisotropy),t.colorSpace!==void 0&&(e.colorSpace=t.colorSpace),t.flipY!==void 0&&(e.flipY=t.flipY),t.generateMipmaps!==void 0&&(e.generateMipmaps=t.generateMipmaps),t.internalFormat!==void 0&&(e.internalFormat=t.internalFormat);for(let n=0;n<this.textures.length;n++)this.textures[n].setValues(e)}get texture(){return this.textures[0]}set texture(t){this.textures[0]=t}set depthTexture(t){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),t!==null&&(t.renderTarget=this),this._depthTexture=t}get depthTexture(){return this._depthTexture}setSize(t,e,n=1){if(this.width!==t||this.height!==e||this.depth!==n){this.width=t,this.height=e,this.depth=n;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=t,this.textures[s].image.height=e,this.textures[s].image.depth=n,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,t,e),this.scissor.set(0,0,t,e)}clone(){return new this.constructor().copy(this)}copy(t){this.width=t.width,this.height=t.height,this.depth=t.depth,this.scissor.copy(t.scissor),this.scissorTest=t.scissorTest,this.viewport.copy(t.viewport),this.textures.length=0;for(let e=0,n=t.textures.length;e<n;e++){this.textures[e]=t.textures[e].clone(),this.textures[e].isRenderTargetTexture=!0,this.textures[e].renderTarget=this;let s=Object.assign({},t.textures[e].image);this.textures[e].source=new Cs(s)}return this.depthBuffer=t.depthBuffer,this.stencilBuffer=t.stencilBuffer,this.resolveDepthBuffer=t.resolveDepthBuffer,this.resolveStencilBuffer=t.resolveStencilBuffer,t.depthTexture!==null&&(this.depthTexture=t.depthTexture.clone()),this.samples=t.samples,this.multiview=t.multiview,this.useArrayDepthTexture=t.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}},mn=class extends Ja{constructor(t=1,e=1,n={}){super(t,e,n),this.isWebGLRenderTarget=!0}},fr=class extends Qe{constructor(t=null,e=1,n=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=He,this.minFilter=He,this.wrapR=an,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(t){this.layerUpdates.add(t)}clearLayerUpdates(){this.layerUpdates.clear()}};var Ka=class extends Qe{constructor(t=null,e=1,n=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:t,width:e,height:n,depth:s},this.magFilter=He,this.minFilter=He,this.wrapR=an,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var co=class co{constructor(t,e,n,s,r,a,o,l,c,f,u,d,p,g,y,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],t!==void 0&&this.set(t,e,n,s,r,a,o,l,c,f,u,d,p,g,y,m)}set(t,e,n,s,r,a,o,l,c,f,u,d,p,g,y,m){let _=this.elements;return _[0]=t,_[4]=e,_[8]=n,_[12]=s,_[1]=r,_[5]=a,_[9]=o,_[13]=l,_[2]=c,_[6]=f,_[10]=u,_[14]=d,_[3]=p,_[7]=g,_[11]=y,_[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new co().fromArray(this.elements)}copy(t){let e=this.elements,n=t.elements;return e[0]=n[0],e[1]=n[1],e[2]=n[2],e[3]=n[3],e[4]=n[4],e[5]=n[5],e[6]=n[6],e[7]=n[7],e[8]=n[8],e[9]=n[9],e[10]=n[10],e[11]=n[11],e[12]=n[12],e[13]=n[13],e[14]=n[14],e[15]=n[15],this}copyPosition(t){let e=this.elements,n=t.elements;return e[12]=n[12],e[13]=n[13],e[14]=n[14],this}setFromMatrix3(t){let e=t.elements;return this.set(e[0],e[3],e[6],0,e[1],e[4],e[7],0,e[2],e[5],e[8],0,0,0,0,1),this}extractBasis(t,e,n){return this.determinantAffine()===0?(t.set(1,0,0),e.set(0,1,0),n.set(0,0,1),this):(t.setFromMatrixColumn(this,0),e.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this)}makeBasis(t,e,n){return this.set(t.x,e.x,n.x,0,t.y,e.y,n.y,0,t.z,e.z,n.z,0,0,0,0,1),this}extractRotation(t){if(t.determinantAffine()===0)return this.identity();let e=this.elements,n=t.elements,s=1/us.setFromMatrixColumn(t,0).length(),r=1/us.setFromMatrixColumn(t,1).length(),a=1/us.setFromMatrixColumn(t,2).length();return e[0]=n[0]*s,e[1]=n[1]*s,e[2]=n[2]*s,e[3]=0,e[4]=n[4]*r,e[5]=n[5]*r,e[6]=n[6]*r,e[7]=0,e[8]=n[8]*a,e[9]=n[9]*a,e[10]=n[10]*a,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromEuler(t){let e=this.elements,n=t.x,s=t.y,r=t.z,a=Math.cos(n),o=Math.sin(n),l=Math.cos(s),c=Math.sin(s),f=Math.cos(r),u=Math.sin(r);if(t.order==="XYZ"){let d=a*f,p=a*u,g=o*f,y=o*u;e[0]=l*f,e[4]=-l*u,e[8]=c,e[1]=p+g*c,e[5]=d-y*c,e[9]=-o*l,e[2]=y-d*c,e[6]=g+p*c,e[10]=a*l}else if(t.order==="YXZ"){let d=l*f,p=l*u,g=c*f,y=c*u;e[0]=d+y*o,e[4]=g*o-p,e[8]=a*c,e[1]=a*u,e[5]=a*f,e[9]=-o,e[2]=p*o-g,e[6]=y+d*o,e[10]=a*l}else if(t.order==="ZXY"){let d=l*f,p=l*u,g=c*f,y=c*u;e[0]=d-y*o,e[4]=-a*u,e[8]=g+p*o,e[1]=p+g*o,e[5]=a*f,e[9]=y-d*o,e[2]=-a*c,e[6]=o,e[10]=a*l}else if(t.order==="ZYX"){let d=a*f,p=a*u,g=o*f,y=o*u;e[0]=l*f,e[4]=g*c-p,e[8]=d*c+y,e[1]=l*u,e[5]=y*c+d,e[9]=p*c-g,e[2]=-c,e[6]=o*l,e[10]=a*l}else if(t.order==="YZX"){let d=a*l,p=a*c,g=o*l,y=o*c;e[0]=l*f,e[4]=y-d*u,e[8]=g*u+p,e[1]=u,e[5]=a*f,e[9]=-o*f,e[2]=-c*f,e[6]=p*u+g,e[10]=d-y*u}else if(t.order==="XZY"){let d=a*l,p=a*c,g=o*l,y=o*c;e[0]=l*f,e[4]=-u,e[8]=c*f,e[1]=d*u+y,e[5]=a*f,e[9]=p*u-g,e[2]=g*u-p,e[6]=o*f,e[10]=y*u+d}return e[3]=0,e[7]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,this}makeRotationFromQuaternion(t){return this.compose(ed,t,nd)}lookAt(t,e,n){let s=this.elements;return fn.subVectors(t,e),fn.lengthSq()===0&&(fn.z=1),fn.normalize(),gi.crossVectors(n,fn),gi.lengthSq()===0&&(Math.abs(n.z)===1?fn.x+=1e-4:fn.z+=1e-4,fn.normalize(),gi.crossVectors(n,fn)),gi.normalize(),da.crossVectors(fn,gi),s[0]=gi.x,s[4]=da.x,s[8]=fn.x,s[1]=gi.y,s[5]=da.y,s[9]=fn.y,s[2]=gi.z,s[6]=da.z,s[10]=fn.z,this}multiply(t){return this.multiplyMatrices(this,t)}premultiply(t){return this.multiplyMatrices(t,this)}multiplyMatrices(t,e){let n=t.elements,s=e.elements,r=this.elements,a=n[0],o=n[4],l=n[8],c=n[12],f=n[1],u=n[5],d=n[9],p=n[13],g=n[2],y=n[6],m=n[10],_=n[14],R=n[3],w=n[7],v=n[11],E=n[15],C=s[0],D=s[4],S=s[8],T=s[12],L=s[1],N=s[5],F=s[9],Y=s[13],J=s[2],O=s[6],K=s[10],Z=s[14],st=s[3],lt=s[7],St=s[11],mt=s[15];return r[0]=a*C+o*L+l*J+c*st,r[4]=a*D+o*N+l*O+c*lt,r[8]=a*S+o*F+l*K+c*St,r[12]=a*T+o*Y+l*Z+c*mt,r[1]=f*C+u*L+d*J+p*st,r[5]=f*D+u*N+d*O+p*lt,r[9]=f*S+u*F+d*K+p*St,r[13]=f*T+u*Y+d*Z+p*mt,r[2]=g*C+y*L+m*J+_*st,r[6]=g*D+y*N+m*O+_*lt,r[10]=g*S+y*F+m*K+_*St,r[14]=g*T+y*Y+m*Z+_*mt,r[3]=R*C+w*L+v*J+E*st,r[7]=R*D+w*N+v*O+E*lt,r[11]=R*S+w*F+v*K+E*St,r[15]=R*T+w*Y+v*Z+E*mt,this}multiplyScalar(t){let e=this.elements;return e[0]*=t,e[4]*=t,e[8]*=t,e[12]*=t,e[1]*=t,e[5]*=t,e[9]*=t,e[13]*=t,e[2]*=t,e[6]*=t,e[10]*=t,e[14]*=t,e[3]*=t,e[7]*=t,e[11]*=t,e[15]*=t,this}determinant(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[12],a=t[1],o=t[5],l=t[9],c=t[13],f=t[2],u=t[6],d=t[10],p=t[14],g=t[3],y=t[7],m=t[11],_=t[15],R=l*p-c*d,w=o*p-c*u,v=o*d-l*u,E=a*p-c*f,C=a*d-l*f,D=a*u-o*f;return e*(y*R-m*w+_*v)-n*(g*R-m*E+_*C)+s*(g*w-y*E+_*D)-r*(g*v-y*C+m*D)}determinantAffine(){let t=this.elements,e=t[0],n=t[4],s=t[8],r=t[1],a=t[5],o=t[9],l=t[2],c=t[6],f=t[10];return e*(a*f-o*c)-n*(r*f-o*l)+s*(r*c-a*l)}transpose(){let t=this.elements,e;return e=t[1],t[1]=t[4],t[4]=e,e=t[2],t[2]=t[8],t[8]=e,e=t[6],t[6]=t[9],t[9]=e,e=t[3],t[3]=t[12],t[12]=e,e=t[7],t[7]=t[13],t[13]=e,e=t[11],t[11]=t[14],t[14]=e,this}setPosition(t,e,n){let s=this.elements;return t.isVector3?(s[12]=t.x,s[13]=t.y,s[14]=t.z):(s[12]=t,s[13]=e,s[14]=n),this}invert(){let t=this.elements,e=t[0],n=t[1],s=t[2],r=t[3],a=t[4],o=t[5],l=t[6],c=t[7],f=t[8],u=t[9],d=t[10],p=t[11],g=t[12],y=t[13],m=t[14],_=t[15],R=e*o-n*a,w=e*l-s*a,v=e*c-r*a,E=n*l-s*o,C=n*c-r*o,D=s*c-r*l,S=f*y-u*g,T=f*m-d*g,L=f*_-p*g,N=u*m-d*y,F=u*_-p*y,Y=d*_-p*m,J=R*Y-w*F+v*N+E*L-C*T+D*S;if(J===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let O=1/J;return t[0]=(o*Y-l*F+c*N)*O,t[1]=(s*F-n*Y-r*N)*O,t[2]=(y*D-m*C+_*E)*O,t[3]=(d*C-u*D-p*E)*O,t[4]=(l*L-a*Y-c*T)*O,t[5]=(e*Y-s*L+r*T)*O,t[6]=(m*v-g*D-_*w)*O,t[7]=(f*D-d*v+p*w)*O,t[8]=(a*F-o*L+c*S)*O,t[9]=(n*L-e*F-r*S)*O,t[10]=(g*C-y*v+_*R)*O,t[11]=(u*v-f*C-p*R)*O,t[12]=(o*T-a*N-l*S)*O,t[13]=(e*N-n*T+s*S)*O,t[14]=(y*w-g*E-m*R)*O,t[15]=(f*E-u*w+d*R)*O,this}scale(t){let e=this.elements,n=t.x,s=t.y,r=t.z;return e[0]*=n,e[4]*=s,e[8]*=r,e[1]*=n,e[5]*=s,e[9]*=r,e[2]*=n,e[6]*=s,e[10]*=r,e[3]*=n,e[7]*=s,e[11]*=r,this}getMaxScaleOnAxis(){let t=this.elements,e=t[0]*t[0]+t[1]*t[1]+t[2]*t[2],n=t[4]*t[4]+t[5]*t[5]+t[6]*t[6],s=t[8]*t[8]+t[9]*t[9]+t[10]*t[10];return Math.sqrt(Math.max(e,n,s))}makeTranslation(t,e,n){return t.isVector3?this.set(1,0,0,t.x,0,1,0,t.y,0,0,1,t.z,0,0,0,1):this.set(1,0,0,t,0,1,0,e,0,0,1,n,0,0,0,1),this}makeRotationX(t){let e=Math.cos(t),n=Math.sin(t);return this.set(1,0,0,0,0,e,-n,0,0,n,e,0,0,0,0,1),this}makeRotationY(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,0,n,0,0,1,0,0,-n,0,e,0,0,0,0,1),this}makeRotationZ(t){let e=Math.cos(t),n=Math.sin(t);return this.set(e,-n,0,0,n,e,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(t,e){let n=Math.cos(e),s=Math.sin(e),r=1-n,a=t.x,o=t.y,l=t.z,c=r*a,f=r*o;return this.set(c*a+n,c*o-s*l,c*l+s*o,0,c*o+s*l,f*o+n,f*l-s*a,0,c*l-s*o,f*l+s*a,r*l*l+n,0,0,0,0,1),this}makeScale(t,e,n){return this.set(t,0,0,0,0,e,0,0,0,0,n,0,0,0,0,1),this}makeShear(t,e,n,s,r,a){return this.set(1,n,r,0,t,1,a,0,e,s,1,0,0,0,0,1),this}compose(t,e,n){let s=this.elements,r=e._x,a=e._y,o=e._z,l=e._w,c=r+r,f=a+a,u=o+o,d=r*c,p=r*f,g=r*u,y=a*f,m=a*u,_=o*u,R=l*c,w=l*f,v=l*u,E=n.x,C=n.y,D=n.z;return s[0]=(1-(y+_))*E,s[1]=(p+v)*E,s[2]=(g-w)*E,s[3]=0,s[4]=(p-v)*C,s[5]=(1-(d+_))*C,s[6]=(m+R)*C,s[7]=0,s[8]=(g+w)*D,s[9]=(m-R)*D,s[10]=(1-(d+y))*D,s[11]=0,s[12]=t.x,s[13]=t.y,s[14]=t.z,s[15]=1,this}decompose(t,e,n){let s=this.elements;t.x=s[12],t.y=s[13],t.z=s[14];let r=this.determinantAffine();if(r===0)return n.set(1,1,1),e.identity(),this;let a=us.set(s[0],s[1],s[2]).length(),o=us.set(s[4],s[5],s[6]).length(),l=us.set(s[8],s[9],s[10]).length();r<0&&(a=-a),An.copy(this);let c=1/a,f=1/o,u=1/l;return An.elements[0]*=c,An.elements[1]*=c,An.elements[2]*=c,An.elements[4]*=f,An.elements[5]*=f,An.elements[6]*=f,An.elements[8]*=u,An.elements[9]*=u,An.elements[10]*=u,e.setFromRotationMatrix(An),n.x=a,n.y=o,n.z=l,this}makePerspective(t,e,n,s,r,a,o=Cn,l=!1){let c=this.elements,f=2*r/(e-t),u=2*r/(n-s),d=(e+t)/(e-t),p=(n+s)/(n-s),g,y;if(l)g=r/(a-r),y=a*r/(a-r);else if(o===Cn)g=-(a+r)/(a-r),y=-2*a*r/(a-r);else if(o===Ts)g=-a/(a-r),y=-a*r/(a-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=f,c[4]=0,c[8]=d,c[12]=0,c[1]=0,c[5]=u,c[9]=p,c[13]=0,c[2]=0,c[6]=0,c[10]=g,c[14]=y,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(t,e,n,s,r,a,o=Cn,l=!1){let c=this.elements,f=2/(e-t),u=2/(n-s),d=-(e+t)/(e-t),p=-(n+s)/(n-s),g,y;if(l)g=1/(a-r),y=a/(a-r);else if(o===Cn)g=-2/(a-r),y=-(a+r)/(a-r);else if(o===Ts)g=-1/(a-r),y=-r/(a-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=f,c[4]=0,c[8]=0,c[12]=d,c[1]=0,c[5]=u,c[9]=0,c[13]=p,c[2]=0,c[6]=0,c[10]=g,c[14]=y,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(t){let e=this.elements,n=t.elements;for(let s=0;s<16;s++)if(e[s]!==n[s])return!1;return!0}fromArray(t,e=0){for(let n=0;n<16;n++)this.elements[n]=t[n+e];return this}toArray(t=[],e=0){let n=this.elements;return t[e]=n[0],t[e+1]=n[1],t[e+2]=n[2],t[e+3]=n[3],t[e+4]=n[4],t[e+5]=n[5],t[e+6]=n[6],t[e+7]=n[7],t[e+8]=n[8],t[e+9]=n[9],t[e+10]=n[10],t[e+11]=n[11],t[e+12]=n[12],t[e+13]=n[13],t[e+14]=n[14],t[e+15]=n[15],t}};co.prototype.isMatrix4=!0;var se=co,us=new H,An=new se,ed=new H(0,0,0),nd=new H(1,1,1),gi=new H,da=new H,fn=new H,yh=new se,vh=new We,gn=class i{constructor(t=0,e=0,n=0,s=i.DEFAULT_ORDER){this.isEuler=!0,this._x=t,this._y=e,this._z=n,this._order=s}get x(){return this._x}set x(t){this._x=t,this._onChangeCallback()}get y(){return this._y}set y(t){this._y=t,this._onChangeCallback()}get z(){return this._z}set z(t){this._z=t,this._onChangeCallback()}get order(){return this._order}set order(t){this._order=t,this._onChangeCallback()}set(t,e,n,s=this._order){return this._x=t,this._y=e,this._z=n,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(t){return this._x=t._x,this._y=t._y,this._z=t._z,this._order=t._order,this._onChangeCallback(),this}setFromRotationMatrix(t,e=this._order,n=!0){let s=t.elements,r=s[0],a=s[4],o=s[8],l=s[1],c=s[5],f=s[9],u=s[2],d=s[6],p=s[10];switch(e){case"XYZ":this._y=Math.asin(ae(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-f,p),this._z=Math.atan2(-a,r)):(this._x=Math.atan2(d,c),this._z=0);break;case"YXZ":this._x=Math.asin(-ae(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(o,p),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(ae(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,r));break;case"ZYX":this._y=Math.asin(-ae(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(l,r)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(ae(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-f,c),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(o,p));break;case"XZY":this._z=Math.asin(-ae(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(d,c),this._y=Math.atan2(o,r)):(this._x=Math.atan2(-f,p),this._y=0);break;default:Jt("Euler: .setFromRotationMatrix() encountered an unknown order: "+e)}return this._order=e,n===!0&&this._onChangeCallback(),this}setFromQuaternion(t,e,n){return yh.makeRotationFromQuaternion(t),this.setFromRotationMatrix(yh,e,n)}setFromVector3(t,e=this._order){return this.set(t.x,t.y,t.z,e)}reorder(t){return vh.setFromEuler(this),this.setFromQuaternion(vh,t)}equals(t){return t._x===this._x&&t._y===this._y&&t._z===this._z&&t._order===this._order}fromArray(t){return this._x=t[0],this._y=t[1],this._z=t[2],t[3]!==void 0&&(this._order=t[3]),this._onChangeCallback(),this}toArray(t=[],e=0){return t[e]=this._x,t[e+1]=this._y,t[e+2]=this._z,t[e+3]=this._order,t}_onChange(t){return this._onChangeCallback=t,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};gn.DEFAULT_ORDER="XYZ";var dr=class{constructor(){this.mask=1}set(t){this.mask=(1<<t|0)>>>0}enable(t){this.mask|=1<<t|0}enableAll(){this.mask=-1}toggle(t){this.mask^=1<<t|0}disable(t){this.mask&=~(1<<t|0)}disableAll(){this.mask=0}test(t){return(this.mask&t.mask)!==0}isEnabled(t){return(this.mask&(1<<t|0))!==0}},id=0,Sh=new H,fs=new We,jn=new se,pa=new H,Qs=new H,sd=new H,rd=new We,Mh=new H(1,0,0),bh=new H(0,1,0),wh=new H(0,0,1),Ah={type:"added"},ad={type:"removed"},ds={type:"childadded",child:null},_l={type:"childremoved",child:null},we=class i extends Rn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:id++}),this.uuid=Ii(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=i.DEFAULT_UP.clone();let t=new H,e=new gn,n=new We,s=new H(1,1,1);function r(){n.setFromEuler(e,!1)}function a(){e.setFromQuaternion(n,void 0,!1)}e._onChange(r),n._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:t},rotation:{configurable:!0,enumerable:!0,value:e},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new se},normalMatrix:{value:new ne}}),this.matrix=new se,this.matrixWorld=new se,this.matrixAutoUpdate=i.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=i.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new dr,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(t){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(t),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(t){return this.quaternion.premultiply(t),this}setRotationFromAxisAngle(t,e){this.quaternion.setFromAxisAngle(t,e)}setRotationFromEuler(t){this.quaternion.setFromEuler(t,!0)}setRotationFromMatrix(t){this.quaternion.setFromRotationMatrix(t)}setRotationFromQuaternion(t){this.quaternion.copy(t)}rotateOnAxis(t,e){return fs.setFromAxisAngle(t,e),this.quaternion.multiply(fs),this}rotateOnWorldAxis(t,e){return fs.setFromAxisAngle(t,e),this.quaternion.premultiply(fs),this}rotateX(t){return this.rotateOnAxis(Mh,t)}rotateY(t){return this.rotateOnAxis(bh,t)}rotateZ(t){return this.rotateOnAxis(wh,t)}translateOnAxis(t,e){return Sh.copy(t).applyQuaternion(this.quaternion),this.position.add(Sh.multiplyScalar(e)),this}translateX(t){return this.translateOnAxis(Mh,t)}translateY(t){return this.translateOnAxis(bh,t)}translateZ(t){return this.translateOnAxis(wh,t)}localToWorld(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(this.matrixWorld)}worldToLocal(t){return this.updateWorldMatrix(!0,!1),t.applyMatrix4(jn.copy(this.matrixWorld).invert())}lookAt(t,e,n){t.isVector3?pa.copy(t):pa.set(t,e,n);let s=this.parent;this.updateWorldMatrix(!0,!1),Qs.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?jn.lookAt(Qs,pa,this.up):jn.lookAt(pa,Qs,this.up),this.quaternion.setFromRotationMatrix(jn),s&&(jn.extractRotation(s.matrixWorld),fs.setFromRotationMatrix(jn),this.quaternion.premultiply(fs.invert()))}add(t){if(arguments.length>1){for(let e=0;e<arguments.length;e++)this.add(arguments[e]);return this}return t===this?(jt("Object3D.add: object can't be added as a child of itself.",t),this):(t&&t.isObject3D?(t.removeFromParent(),t.parent=this,this.children.push(t),t.dispatchEvent(Ah),ds.child=t,this.dispatchEvent(ds),ds.child=null):jt("Object3D.add: object not an instance of THREE.Object3D.",t),this)}remove(t){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let e=this.children.indexOf(t);return e!==-1&&(t.parent=null,this.children.splice(e,1),t.dispatchEvent(ad),_l.child=t,this.dispatchEvent(_l),_l.child=null),this}removeFromParent(){let t=this.parent;return t!==null&&t.remove(this),this}clear(){return this.remove(...this.children)}attach(t){return this.updateWorldMatrix(!0,!1),jn.copy(this.matrixWorld).invert(),t.parent!==null&&(t.parent.updateWorldMatrix(!0,!1),jn.multiply(t.parent.matrixWorld)),t.applyMatrix4(jn),t.removeFromParent(),t.parent=this,this.children.push(t),t.updateWorldMatrix(!1,!0),t.dispatchEvent(Ah),ds.child=t,this.dispatchEvent(ds),ds.child=null,this}getObjectById(t){return this.getObjectByProperty("id",t)}getObjectByName(t){return this.getObjectByProperty("name",t)}getObjectByProperty(t,e){if(this[t]===e)return this;for(let n=0,s=this.children.length;n<s;n++){let a=this.children[n].getObjectByProperty(t,e);if(a!==void 0)return a}}getObjectsByProperty(t,e,n=[]){this[t]===e&&n.push(this);let s=this.children;for(let r=0,a=s.length;r<a;r++)s[r].getObjectsByProperty(t,e,n);return n}getWorldPosition(t){return this.updateWorldMatrix(!0,!1),t.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Qs,t,sd),t}getWorldScale(t){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Qs,rd,t),t}getWorldDirection(t){this.updateWorldMatrix(!0,!1);let e=this.matrixWorld.elements;return t.set(e[8],e[9],e[10]).normalize()}raycast(){}traverse(t){t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverse(t)}traverseVisible(t){if(this.visible===!1)return;t(this);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].traverseVisible(t)}traverseAncestors(t){let e=this.parent;e!==null&&(t(e),e.traverseAncestors(t))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);let t=this.pivot;if(t!==null){let e=t.x,n=t.y,s=t.z,r=this.matrix.elements;r[12]+=e-r[0]*e-r[4]*n-r[8]*s,r[13]+=n-r[1]*e-r[5]*n-r[9]*s,r[14]+=s-r[2]*e-r[6]*n-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(t){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||t)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,t=!0);let e=this.children;for(let n=0,s=e.length;n<s;n++)e[n].updateMatrixWorld(t)}updateWorldMatrix(t,e,n=!1){let s=this.parent;if(t===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||n)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,n=!0),e===!0){let r=this.children;for(let a=0,o=r.length;a<o;a++)r[a].updateWorldMatrix(!1,!0,n)}}toJSON(t){let e=t===void 0||typeof t=="string",n={};e&&(t={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});let s={};s.uuid=this.uuid,s.type=this.type,this.name!==""&&(s.name=this.name),this.castShadow===!0&&(s.castShadow=!0),this.receiveShadow===!0&&(s.receiveShadow=!0),this.visible===!1&&(s.visible=!1),this.frustumCulled===!1&&(s.frustumCulled=!1),this.renderOrder!==0&&(s.renderOrder=this.renderOrder),this.static!==!1&&(s.static=this.static),Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.matrixAutoUpdate===!1&&(s.matrixAutoUpdate=!1),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(o=>({...o})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(t),s.indirectTexture=this._indirectTexture.toJSON(t),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(t)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(t)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(t).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(t).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(t.geometries,this.geometry);let o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){let l=o.shapes;if(Array.isArray(l))for(let c=0,f=l.length;c<f;c++){let u=l[c];r(t.shapes,u)}else r(t.shapes,l)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(t.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(r(t.materials,this.material[l]));s.material=o}else s.material=r(t.materials,this.material);if(this.children.length>0){s.children=[];for(let o=0;o<this.children.length;o++)s.children.push(this.children[o].toJSON(t).object)}if(this.animations.length>0){s.animations=[];for(let o=0;o<this.animations.length;o++){let l=this.animations[o];s.animations.push(r(t.animations,l))}}if(e){let o=a(t.geometries),l=a(t.materials),c=a(t.textures),f=a(t.images),u=a(t.shapes),d=a(t.skeletons),p=a(t.animations),g=a(t.nodes);o.length>0&&(n.geometries=o),l.length>0&&(n.materials=l),c.length>0&&(n.textures=c),f.length>0&&(n.images=f),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=s,n;function a(o){let l=[];for(let c in o){let f=o[c];delete f.metadata,l.push(f)}return l}}clone(t){return new this.constructor().copy(this,t)}copy(t,e=!0){if(this.name=t.name,this.up.copy(t.up),this.position.copy(t.position),this.rotation.order=t.rotation.order,this.quaternion.copy(t.quaternion),this.scale.copy(t.scale),this.pivot=t.pivot!==null?t.pivot.clone():null,this.matrix.copy(t.matrix),this.matrixWorld.copy(t.matrixWorld),this.matrixAutoUpdate=t.matrixAutoUpdate,this.matrixWorldAutoUpdate=t.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=t.matrixWorldNeedsUpdate,this.layers.mask=t.layers.mask,this.visible=t.visible,this.castShadow=t.castShadow,this.receiveShadow=t.receiveShadow,this.frustumCulled=t.frustumCulled,this.renderOrder=t.renderOrder,this.static=t.static,this.animations=t.animations.slice(),this.userData=JSON.parse(JSON.stringify(t.userData)),e===!0)for(let n=0;n<t.children.length;n++){let s=t.children[n];this.add(s.clone())}return this}};we.DEFAULT_UP=new H(0,1,0);we.DEFAULT_MATRIX_AUTO_UPDATE=!0;we.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var zn=class extends we{constructor(){super(),this.isGroup=!0,this.type="Group"}},od={type:"move"},Rs=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new zn,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new zn,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new H,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new H),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new zn,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new H,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new H,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(t){return this._targetRay!==null&&this._targetRay.dispatchEvent(t),this._grip!==null&&this._grip.dispatchEvent(t),this._hand!==null&&this._hand.dispatchEvent(t),this}connect(t){if(t&&t.hand){let e=this._hand;if(e)for(let n of t.hand.values())this._getHandJoint(e,n)}return this.dispatchEvent({type:"connected",data:t}),this}disconnect(t){return this.dispatchEvent({type:"disconnected",data:t}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(t,e,n){let s=null,r=null,a=null,o=this._targetRay,l=this._grip,c=this._hand;if(t&&e.session.visibilityState!=="visible-blurred"){if(c&&t.hand){a=!0;for(let y of t.hand.values()){let m=e.getJointPose(y,n),_=this._getHandJoint(c,y);m!==null&&(_.matrix.fromArray(m.transform.matrix),_.matrix.decompose(_.position,_.rotation,_.scale),_.matrixWorldNeedsUpdate=!0,_.jointRadius=m.radius),_.visible=m!==null}let f=c.joints["index-finger-tip"],u=c.joints["thumb-tip"],d=f.position.distanceTo(u.position),p=.02,g=.005;c.inputState.pinching&&d>p+g?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:t.handedness,target:this})):!c.inputState.pinching&&d<=p-g&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:t.handedness,target:this}))}else l!==null&&t.gripSpace&&(r=e.getPose(t.gripSpace,n),r!==null&&(l.matrix.fromArray(r.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,r.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(r.linearVelocity)):l.hasLinearVelocity=!1,r.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(r.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:t,target:this})));o!==null&&(s=e.getPose(t.targetRaySpace,n),s===null&&r!==null&&(s=r),s!==null&&(o.matrix.fromArray(s.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,s.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(s.linearVelocity)):o.hasLinearVelocity=!1,s.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(s.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(od)))}return o!==null&&(o.visible=s!==null),l!==null&&(l.visible=r!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(t,e){if(t.joints[e.jointName]===void 0){let n=new zn;n.matrixAutoUpdate=!1,n.visible=!1,t.joints[e.jointName]=n,t.add(n)}return t.joints[e.jointName]}},Iu={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},_i={h:0,s:0,l:0},ma={h:0,s:0,l:0};function xl(i,t,e){return e<0&&(e+=1),e>1&&(e-=1),e<1/6?i+(t-i)*6*e:e<1/2?t:e<2/3?i+(t-i)*6*(2/3-e):i}var ie=class{constructor(t,e,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(t,e,n)}set(t,e,n){if(e===void 0&&n===void 0){let s=t;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(t,e,n);return this}setScalar(t){return this.r=t,this.g=t,this.b=t,this}setHex(t,e=pe){return t=Math.floor(t),this.r=(t>>16&255)/255,this.g=(t>>8&255)/255,this.b=(t&255)/255,ce.colorSpaceToWorking(this,e),this}setRGB(t,e,n,s=ce.workingColorSpace){return this.r=t,this.g=e,this.b=n,ce.colorSpaceToWorking(this,s),this}setHSL(t,e,n,s=ce.workingColorSpace){if(t=yc(t,1),e=ae(e,0,1),n=ae(n,0,1),e===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+e):n+e-n*e,a=2*n-r;this.r=xl(a,r,t+1/3),this.g=xl(a,r,t),this.b=xl(a,r,t-1/3)}return ce.colorSpaceToWorking(this,s),this}setStyle(t,e=pe){function n(r){r!==void 0&&parseFloat(r)<1&&Jt("Color: Alpha component of "+t+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(t)){let r,a=s[1],o=s[2];switch(a){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,e);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,e);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,e);break;default:Jt("Color: Unknown color model "+t)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(t)){let r=s[1],a=r.length;if(a===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,e);if(a===6)return this.setHex(parseInt(r,16),e);Jt("Color: Invalid hex color "+t)}else if(t&&t.length>0)return this.setColorName(t,e);return this}setColorName(t,e=pe){let n=Iu[t.toLowerCase()];return n!==void 0?this.setHex(n,e):Jt("Color: Unknown color "+t),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(t){return this.r=t.r,this.g=t.g,this.b=t.b,this}copySRGBToLinear(t){return this.r=ri(t.r),this.g=ri(t.g),this.b=ri(t.b),this}copyLinearToSRGB(t){return this.r=ws(t.r),this.g=ws(t.g),this.b=ws(t.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(t=pe){return ce.workingToColorSpace(je.copy(this),t),Math.round(ae(je.r*255,0,255))*65536+Math.round(ae(je.g*255,0,255))*256+Math.round(ae(je.b*255,0,255))}getHexString(t=pe){return("000000"+this.getHex(t).toString(16)).slice(-6)}getHSL(t,e=ce.workingColorSpace){ce.workingToColorSpace(je.copy(this),e);let n=je.r,s=je.g,r=je.b,a=Math.max(n,s,r),o=Math.min(n,s,r),l,c,f=(o+a)/2;if(o===a)l=0,c=0;else{let u=a-o;switch(c=f<=.5?u/(a+o):u/(2-a-o),a){case n:l=(s-r)/u+(s<r?6:0);break;case s:l=(r-n)/u+2;break;case r:l=(n-s)/u+4;break}l/=6}return t.h=l,t.s=c,t.l=f,t}getRGB(t,e=ce.workingColorSpace){return ce.workingToColorSpace(je.copy(this),e),t.r=je.r,t.g=je.g,t.b=je.b,t}getStyle(t=pe){ce.workingToColorSpace(je.copy(this),t);let e=je.r,n=je.g,s=je.b;return t!==pe?`color(${t} ${e.toFixed(3)} ${n.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(e*255)},${Math.round(n*255)},${Math.round(s*255)})`}offsetHSL(t,e,n){return this.getHSL(_i),this.setHSL(_i.h+t,_i.s+e,_i.l+n)}add(t){return this.r+=t.r,this.g+=t.g,this.b+=t.b,this}addColors(t,e){return this.r=t.r+e.r,this.g=t.g+e.g,this.b=t.b+e.b,this}addScalar(t){return this.r+=t,this.g+=t,this.b+=t,this}sub(t){return this.r=Math.max(0,this.r-t.r),this.g=Math.max(0,this.g-t.g),this.b=Math.max(0,this.b-t.b),this}multiply(t){return this.r*=t.r,this.g*=t.g,this.b*=t.b,this}multiplyScalar(t){return this.r*=t,this.g*=t,this.b*=t,this}lerp(t,e){return this.r+=(t.r-this.r)*e,this.g+=(t.g-this.g)*e,this.b+=(t.b-this.b)*e,this}lerpColors(t,e,n){return this.r=t.r+(e.r-t.r)*n,this.g=t.g+(e.g-t.g)*n,this.b=t.b+(e.b-t.b)*n,this}lerpHSL(t,e){this.getHSL(_i),t.getHSL(ma);let n=lr(_i.h,ma.h,e),s=lr(_i.s,ma.s,e),r=lr(_i.l,ma.l,e);return this.setHSL(n,s,r),this}setFromVector3(t){return this.r=t.x,this.g=t.y,this.b=t.z,this}applyMatrix3(t){let e=this.r,n=this.g,s=this.b,r=t.elements;return this.r=r[0]*e+r[3]*n+r[6]*s,this.g=r[1]*e+r[4]*n+r[7]*s,this.b=r[2]*e+r[5]*n+r[8]*s,this}equals(t){return t.r===this.r&&t.g===this.g&&t.b===this.b}fromArray(t,e=0){return this.r=t[e],this.g=t[e+1],this.b=t[e+2],this}toArray(t=[],e=0){return t[e]=this.r,t[e+1]=this.g,t[e+2]=this.b,t}fromBufferAttribute(t,e){return this.r=t.getX(e),this.g=t.getY(e),this.b=t.getZ(e),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},je=new ie;ie.NAMES=Iu;var Ps=class extends we{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new gn,this.environmentIntensity=1,this.environmentRotation=new gn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(t,e){return super.copy(t,e),t.background!==null&&(this.background=t.background.clone()),t.environment!==null&&(this.environment=t.environment.clone()),t.fog!==null&&(this.fog=t.fog.clone()),this.backgroundBlurriness=t.backgroundBlurriness,this.backgroundIntensity=t.backgroundIntensity,this.backgroundRotation.copy(t.backgroundRotation),this.environmentIntensity=t.environmentIntensity,this.environmentRotation.copy(t.environmentRotation),t.overrideMaterial!==null&&(this.overrideMaterial=t.overrideMaterial.clone()),this.matrixAutoUpdate=t.matrixAutoUpdate,this}toJSON(t){let e=super.toJSON(t);return this.fog!==null&&(e.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(e.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(e.object.backgroundIntensity=this.backgroundIntensity),e.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(e.object.environmentIntensity=this.environmentIntensity),e.object.environmentRotation=this.environmentRotation.toArray(),e}},Tn=new H,Qn=new H,yl=new H,ti=new H,ps=new H,ms=new H,Th=new H,vl=new H,Sl=new H,Ml=new H,bl=new ge,wl=new ge,Al=new ge,Mi=class i{constructor(t=new H,e=new H,n=new H){this.a=t,this.b=e,this.c=n}static getNormal(t,e,n,s){s.subVectors(n,e),Tn.subVectors(t,e),s.cross(Tn);let r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(t,e,n,s,r){Tn.subVectors(s,e),Qn.subVectors(n,e),yl.subVectors(t,e);let a=Tn.dot(Tn),o=Tn.dot(Qn),l=Tn.dot(yl),c=Qn.dot(Qn),f=Qn.dot(yl),u=a*c-o*o;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(c*l-o*f)*d,g=(a*f-o*l)*d;return r.set(1-p-g,g,p)}static containsPoint(t,e,n,s){return this.getBarycoord(t,e,n,s,ti)===null?!1:ti.x>=0&&ti.y>=0&&ti.x+ti.y<=1}static getInterpolation(t,e,n,s,r,a,o,l){return this.getBarycoord(t,e,n,s,ti)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(r,ti.x),l.addScaledVector(a,ti.y),l.addScaledVector(o,ti.z),l)}static getInterpolatedAttribute(t,e,n,s,r,a){return bl.setScalar(0),wl.setScalar(0),Al.setScalar(0),bl.fromBufferAttribute(t,e),wl.fromBufferAttribute(t,n),Al.fromBufferAttribute(t,s),a.setScalar(0),a.addScaledVector(bl,r.x),a.addScaledVector(wl,r.y),a.addScaledVector(Al,r.z),a}static isFrontFacing(t,e,n,s){return Tn.subVectors(n,e),Qn.subVectors(t,e),Tn.cross(Qn).dot(s)<0}set(t,e,n){return this.a.copy(t),this.b.copy(e),this.c.copy(n),this}setFromPointsAndIndices(t,e,n,s){return this.a.copy(t[e]),this.b.copy(t[n]),this.c.copy(t[s]),this}setFromAttributeAndIndices(t,e,n,s){return this.a.fromBufferAttribute(t,e),this.b.fromBufferAttribute(t,n),this.c.fromBufferAttribute(t,s),this}clone(){return new this.constructor().copy(this)}copy(t){return this.a.copy(t.a),this.b.copy(t.b),this.c.copy(t.c),this}getArea(){return Tn.subVectors(this.c,this.b),Qn.subVectors(this.a,this.b),Tn.cross(Qn).length()*.5}getMidpoint(t){return t.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(t){return i.getNormal(this.a,this.b,this.c,t)}getPlane(t){return t.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(t,e){return i.getBarycoord(t,this.a,this.b,this.c,e)}getInterpolation(t,e,n,s,r){return i.getInterpolation(t,this.a,this.b,this.c,e,n,s,r)}containsPoint(t){return i.containsPoint(t,this.a,this.b,this.c)}isFrontFacing(t){return i.isFrontFacing(this.a,this.b,this.c,t)}intersectsBox(t){return t.intersectsTriangle(this)}closestPointToPoint(t,e){let n=this.a,s=this.b,r=this.c,a,o;ps.subVectors(s,n),ms.subVectors(r,n),vl.subVectors(t,n);let l=ps.dot(vl),c=ms.dot(vl);if(l<=0&&c<=0)return e.copy(n);Sl.subVectors(t,s);let f=ps.dot(Sl),u=ms.dot(Sl);if(f>=0&&u<=f)return e.copy(s);let d=l*u-f*c;if(d<=0&&l>=0&&f<=0)return a=l/(l-f),e.copy(n).addScaledVector(ps,a);Ml.subVectors(t,r);let p=ps.dot(Ml),g=ms.dot(Ml);if(g>=0&&p<=g)return e.copy(r);let y=p*c-l*g;if(y<=0&&c>=0&&g<=0)return o=c/(c-g),e.copy(n).addScaledVector(ms,o);let m=f*g-p*u;if(m<=0&&u-f>=0&&p-g>=0)return Th.subVectors(r,s),o=(u-f)/(u-f+(p-g)),e.copy(s).addScaledVector(Th,o);let _=1/(m+y+d);return a=y*_,o=d*_,e.copy(n).addScaledVector(ps,a).addScaledVector(ms,o)}equals(t){return t.a.equals(this.a)&&t.b.equals(this.b)&&t.c.equals(this.c)}},bn=class{constructor(t=new H(1/0,1/0,1/0),e=new H(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=t,this.max=e}set(t,e){return this.min.copy(t),this.max.copy(e),this}setFromArray(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e+=3)this.expandByPoint(En.fromArray(t,e));return this}setFromBufferAttribute(t){this.makeEmpty();for(let e=0,n=t.count;e<n;e++)this.expandByPoint(En.fromBufferAttribute(t,e));return this}setFromPoints(t){this.makeEmpty();for(let e=0,n=t.length;e<n;e++)this.expandByPoint(t[e]);return this}setFromCenterAndSize(t,e){let n=En.copy(e).multiplyScalar(.5);return this.min.copy(t).sub(n),this.max.copy(t).add(n),this}setFromObject(t,e=!1){return this.makeEmpty(),this.expandByObject(t,e)}clone(){return new this.constructor().copy(this)}copy(t){return this.min.copy(t.min),this.max.copy(t.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(t){return this.isEmpty()?t.set(0,0,0):t.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(t){return this.isEmpty()?t.set(0,0,0):t.subVectors(this.max,this.min)}expandByPoint(t){return this.min.min(t),this.max.max(t),this}expandByVector(t){return this.min.sub(t),this.max.add(t),this}expandByScalar(t){return this.min.addScalar(-t),this.max.addScalar(t),this}expandByObject(t,e=!1){t.updateWorldMatrix(!1,!1);let n=t.geometry;if(n!==void 0){let r=n.getAttribute("position");if(e===!0&&r!==void 0&&t.isInstancedMesh!==!0)for(let a=0,o=r.count;a<o;a++)t.isMesh===!0?t.getVertexPosition(a,En):En.fromBufferAttribute(r,a),En.applyMatrix4(t.matrixWorld),this.expandByPoint(En);else t.boundingBox!==void 0?(t.boundingBox===null&&t.computeBoundingBox(),ga.copy(t.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),ga.copy(n.boundingBox)),ga.applyMatrix4(t.matrixWorld),this.union(ga)}let s=t.children;for(let r=0,a=s.length;r<a;r++)this.expandByObject(s[r],e);return this}containsPoint(t){return t.x>=this.min.x&&t.x<=this.max.x&&t.y>=this.min.y&&t.y<=this.max.y&&t.z>=this.min.z&&t.z<=this.max.z}containsBox(t){return this.min.x<=t.min.x&&t.max.x<=this.max.x&&this.min.y<=t.min.y&&t.max.y<=this.max.y&&this.min.z<=t.min.z&&t.max.z<=this.max.z}getParameter(t,e){return e.set((t.x-this.min.x)/(this.max.x-this.min.x),(t.y-this.min.y)/(this.max.y-this.min.y),(t.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(t){return t.max.x>=this.min.x&&t.min.x<=this.max.x&&t.max.y>=this.min.y&&t.min.y<=this.max.y&&t.max.z>=this.min.z&&t.min.z<=this.max.z}intersectsSphere(t){return this.clampPoint(t.center,En),En.distanceToSquared(t.center)<=t.radius*t.radius}intersectsPlane(t){let e,n;return t.normal.x>0?(e=t.normal.x*this.min.x,n=t.normal.x*this.max.x):(e=t.normal.x*this.max.x,n=t.normal.x*this.min.x),t.normal.y>0?(e+=t.normal.y*this.min.y,n+=t.normal.y*this.max.y):(e+=t.normal.y*this.max.y,n+=t.normal.y*this.min.y),t.normal.z>0?(e+=t.normal.z*this.min.z,n+=t.normal.z*this.max.z):(e+=t.normal.z*this.max.z,n+=t.normal.z*this.min.z),e<=-t.constant&&n>=-t.constant}intersectsTriangle(t){if(this.isEmpty())return!1;this.getCenter(tr),_a.subVectors(this.max,tr),gs.subVectors(t.a,tr),_s.subVectors(t.b,tr),xs.subVectors(t.c,tr),xi.subVectors(_s,gs),yi.subVectors(xs,_s),Fi.subVectors(gs,xs);let e=[0,-xi.z,xi.y,0,-yi.z,yi.y,0,-Fi.z,Fi.y,xi.z,0,-xi.x,yi.z,0,-yi.x,Fi.z,0,-Fi.x,-xi.y,xi.x,0,-yi.y,yi.x,0,-Fi.y,Fi.x,0];return!Tl(e,gs,_s,xs,_a)||(e=[1,0,0,0,1,0,0,0,1],!Tl(e,gs,_s,xs,_a))?!1:(xa.crossVectors(xi,yi),e=[xa.x,xa.y,xa.z],Tl(e,gs,_s,xs,_a))}clampPoint(t,e){return e.copy(t).clamp(this.min,this.max)}distanceToPoint(t){return this.clampPoint(t,En).distanceTo(t)}getBoundingSphere(t){return this.isEmpty()?t.makeEmpty():(this.getCenter(t.center),t.radius=this.getSize(En).length()*.5),t}intersect(t){return this.min.max(t.min),this.max.min(t.max),this.isEmpty()&&this.makeEmpty(),this}union(t){return this.min.min(t.min),this.max.max(t.max),this}applyMatrix4(t){return this.isEmpty()?this:(ei[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(t),ei[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(t),ei[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(t),ei[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(t),ei[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(t),ei[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(t),ei[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(t),ei[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(t),this.setFromPoints(ei),this)}translate(t){return this.min.add(t),this.max.add(t),this}equals(t){return t.min.equals(this.min)&&t.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(t){return this.min.fromArray(t.min),this.max.fromArray(t.max),this}},ei=[new H,new H,new H,new H,new H,new H,new H,new H],En=new H,ga=new bn,gs=new H,_s=new H,xs=new H,xi=new H,yi=new H,Fi=new H,tr=new H,_a=new H,xa=new H,Oi=new H;function Tl(i,t,e,n,s){for(let r=0,a=i.length-3;r<=a;r+=3){Oi.fromArray(i,r);let o=s.x*Math.abs(Oi.x)+s.y*Math.abs(Oi.y)+s.z*Math.abs(Oi.z),l=t.dot(Oi),c=e.dot(Oi),f=n.dot(Oi);if(Math.max(-Math.max(l,c,f),Math.min(l,c,f))>o)return!1}return!0}var si=ld();function ld(){let i=new ArrayBuffer(4),t=new Float32Array(i),e=new Uint32Array(i),n=new Uint32Array(512),s=new Uint32Array(512);for(let l=0;l<256;++l){let c=l-127;c<-27?(n[l]=0,n[l|256]=32768,s[l]=24,s[l|256]=24):c<-14?(n[l]=1024>>-c-14,n[l|256]=1024>>-c-14|32768,s[l]=-c-1,s[l|256]=-c-1):c<=15?(n[l]=c+15<<10,n[l|256]=c+15<<10|32768,s[l]=13,s[l|256]=13):c<128?(n[l]=31744,n[l|256]=64512,s[l]=24,s[l|256]=24):(n[l]=31744,n[l|256]=64512,s[l]=13,s[l|256]=13)}let r=new Uint32Array(2048),a=new Uint32Array(64),o=new Uint32Array(64);for(let l=1;l<1024;++l){let c=l<<13,f=0;for(;(c&8388608)===0;)c<<=1,f-=8388608;c&=-8388609,f+=947912704,r[l]=c|f}for(let l=1024;l<2048;++l)r[l]=939524096+(l-1024<<13);for(let l=1;l<31;++l)a[l]=l<<23;a[31]=1199570944,a[32]=2147483648;for(let l=33;l<63;++l)a[l]=2147483648+(l-32<<23);a[63]=3347054592;for(let l=1;l<64;++l)l!==32&&(o[l]=1024);return{floatView:t,uint32View:e,baseTable:n,shiftTable:s,mantissaTable:r,exponentTable:a,offsetTable:o}}function cd(i){Math.abs(i)>65504&&Jt("DataUtils.toHalfFloat(): Value out of range."),i=ae(i,-65504,65504),si.floatView[0]=i;let t=si.uint32View[0],e=t>>23&511;return si.baseTable[e]+((t&8388607)>>si.shiftTable[e])}function hd(i){let t=i>>10;return si.uint32View[0]=si.mantissaTable[si.offsetTable[t]+(i&1023)]+si.exponentTable[t],si.floatView[0]}var Pn=class{static toHalfFloat(t){return cd(t)}static fromHalfFloat(t){return hd(t)}},Fe=new H,ya=new Kt,ud=0,xe=class extends Rn{constructor(t,e,n=!1){if(super(),Array.isArray(t))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:ud++}),this.name="",this.array=t,this.itemSize=e,this.count=t!==void 0?t.length/e:0,this.normalized=n,this.usage=Hl,this.updateRanges=[],this.gpuType=qe,this.version=0}onUploadCallback(){}set needsUpdate(t){t===!0&&this.version++}setUsage(t){return this.usage=t,this}addUpdateRange(t,e){this.updateRanges.push({start:t,count:e})}clearUpdateRanges(){this.updateRanges.length=0}copy(t){return this.name=t.name,this.array=new t.array.constructor(t.array),this.itemSize=t.itemSize,this.count=t.count,this.normalized=t.normalized,this.usage=t.usage,this.gpuType=t.gpuType,this}copyAt(t,e,n){t*=this.itemSize,n*=e.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[t+s]=e.array[n+s];return this}copyArray(t){return this.array.set(t),this}applyMatrix3(t){if(this.itemSize===2)for(let e=0,n=this.count;e<n;e++)ya.fromBufferAttribute(this,e),ya.applyMatrix3(t),this.setXY(e,ya.x,ya.y);else if(this.itemSize===3)for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.applyMatrix3(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}applyMatrix4(t){for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.applyMatrix4(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}applyNormalMatrix(t){for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.applyNormalMatrix(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}transformDirection(t){for(let e=0,n=this.count;e<n;e++)Fe.fromBufferAttribute(this,e),Fe.transformDirection(t),this.setXYZ(e,Fe.x,Fe.y,Fe.z);return this}set(t,e=0){return this.array.set(t,e),this}getComponent(t,e){let n=this.array[t*this.itemSize+e];return this.normalized&&(n=bs(n,this.array)),n}setComponent(t,e,n){return this.normalized&&(n=sn(n,this.array)),this.array[t*this.itemSize+e]=n,this}getX(t){let e=this.array[t*this.itemSize];return this.normalized&&(e=bs(e,this.array)),e}setX(t,e){return this.normalized&&(e=sn(e,this.array)),this.array[t*this.itemSize]=e,this}getY(t){let e=this.array[t*this.itemSize+1];return this.normalized&&(e=bs(e,this.array)),e}setY(t,e){return this.normalized&&(e=sn(e,this.array)),this.array[t*this.itemSize+1]=e,this}getZ(t){let e=this.array[t*this.itemSize+2];return this.normalized&&(e=bs(e,this.array)),e}setZ(t,e){return this.normalized&&(e=sn(e,this.array)),this.array[t*this.itemSize+2]=e,this}getW(t){let e=this.array[t*this.itemSize+3];return this.normalized&&(e=bs(e,this.array)),e}setW(t,e){return this.normalized&&(e=sn(e,this.array)),this.array[t*this.itemSize+3]=e,this}setXY(t,e,n){return t*=this.itemSize,this.normalized&&(e=sn(e,this.array),n=sn(n,this.array)),this.array[t+0]=e,this.array[t+1]=n,this}setXYZ(t,e,n,s){return t*=this.itemSize,this.normalized&&(e=sn(e,this.array),n=sn(n,this.array),s=sn(s,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this}setXYZW(t,e,n,s,r){return t*=this.itemSize,this.normalized&&(e=sn(e,this.array),n=sn(n,this.array),s=sn(s,this.array),r=sn(r,this.array)),this.array[t+0]=e,this.array[t+1]=n,this.array[t+2]=s,this.array[t+3]=r,this}onUpload(t){return this.onUploadCallback=t,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let t={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(t.name=this.name),this.usage!==Hl&&(t.usage=this.usage),t}dispose(){this.dispatchEvent({type:"dispose"})}};var pr=class extends xe{constructor(t,e,n){super(new Uint16Array(t),e,n)}};var mr=class extends xe{constructor(t,e,n){super(new Uint32Array(t),e,n)}};var Ue=class extends xe{constructor(t,e,n){super(new Float32Array(t),e,n)}},fd=new bn,er=new H,El=new H,Gn=class{constructor(t=new H,e=-1){this.isSphere=!0,this.center=t,this.radius=e}set(t,e){return this.center.copy(t),this.radius=e,this}setFromPoints(t,e){let n=this.center;e!==void 0?n.copy(e):fd.setFromPoints(t).getCenter(n);let s=0;for(let r=0,a=t.length;r<a;r++)s=Math.max(s,n.distanceToSquared(t[r]));return this.radius=Math.sqrt(s),this}copy(t){return this.center.copy(t.center),this.radius=t.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(t){return t.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(t){return t.distanceTo(this.center)-this.radius}intersectsSphere(t){let e=this.radius+t.radius;return t.center.distanceToSquared(this.center)<=e*e}intersectsBox(t){return t.intersectsSphere(this)}intersectsPlane(t){return Math.abs(t.distanceToPoint(this.center))<=this.radius}clampPoint(t,e){let n=this.center.distanceToSquared(t);return e.copy(t),n>this.radius*this.radius&&(e.sub(this.center).normalize(),e.multiplyScalar(this.radius).add(this.center)),e}getBoundingBox(t){return this.isEmpty()?(t.makeEmpty(),t):(t.set(this.center,this.center),t.expandByScalar(this.radius),t)}applyMatrix4(t){return this.center.applyMatrix4(t),this.radius=this.radius*t.getMaxScaleOnAxis(),this}translate(t){return this.center.add(t),this}expandByPoint(t){if(this.isEmpty())return this.center.copy(t),this.radius=0,this;er.subVectors(t,this.center);let e=er.lengthSq();if(e>this.radius*this.radius){let n=Math.sqrt(e),s=(n-this.radius)*.5;this.center.addScaledVector(er,s/n),this.radius+=s}return this}union(t){return t.isEmpty()?this:this.isEmpty()?(this.copy(t),this):(this.center.equals(t.center)===!0?this.radius=Math.max(this.radius,t.radius):(El.subVectors(t.center,this.center).setLength(t.radius),this.expandByPoint(er.copy(t.center).add(El)),this.expandByPoint(er.copy(t.center).sub(El))),this)}equals(t){return t.center.equals(this.center)&&t.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(t){return this.radius=t.radius,this.center.fromArray(t.center),this}},dd=0,Sn=new se,Cl=new we,ys=new H,dn=new bn,nr=new bn,Ve=new H,tn=class i extends Rn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:dd++}),this.uuid=Ii(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(t){return Array.isArray(t)?this.index=new(Lf(t)?mr:pr)(t,1):this.index=t,this}setIndirect(t,e=0){return this.indirect=t,this.indirectOffset=e,this}getIndirect(){return this.indirect}getAttribute(t){return this.attributes[t]}setAttribute(t,e){return this.attributes[t]=e,this}deleteAttribute(t){return delete this.attributes[t],this}hasAttribute(t){return this.attributes[t]!==void 0}addGroup(t,e,n=0){this.groups.push({start:t,count:e,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(t,e){this.drawRange.start=t,this.drawRange.count=e}applyMatrix4(t){let e=this.attributes.position;e!==void 0&&(e.applyMatrix4(t),e.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new ne().getNormalMatrix(t);n.applyNormalMatrix(r),n.needsUpdate=!0}let s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(t),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(t){return Sn.makeRotationFromQuaternion(t),this.applyMatrix4(Sn),this}rotateX(t){return Sn.makeRotationX(t),this.applyMatrix4(Sn),this}rotateY(t){return Sn.makeRotationY(t),this.applyMatrix4(Sn),this}rotateZ(t){return Sn.makeRotationZ(t),this.applyMatrix4(Sn),this}translate(t,e,n){return Sn.makeTranslation(t,e,n),this.applyMatrix4(Sn),this}scale(t,e,n){return Sn.makeScale(t,e,n),this.applyMatrix4(Sn),this}lookAt(t){return Cl.lookAt(t),Cl.updateMatrix(),this.applyMatrix4(Cl.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(ys).negate(),this.translate(ys.x,ys.y,ys.z),this}setFromPoints(t){let e=this.getAttribute("position");if(e===void 0){let n=[];for(let s=0,r=t.length;s<r;s++){let a=t[s];n.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Ue(n,3))}else{let n=Math.min(t.length,e.count);for(let s=0;s<n;s++){let r=t[s];e.setXYZ(s,r.x,r.y,r.z||0)}t.length>e.count&&Jt("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),e.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new bn);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){jt("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new H(-1/0,-1/0,-1/0),new H(1/0,1/0,1/0));return}if(t!==void 0){if(this.boundingBox.setFromBufferAttribute(t),e)for(let n=0,s=e.length;n<s;n++){let r=e[n];dn.setFromBufferAttribute(r),this.morphTargetsRelative?(Ve.addVectors(this.boundingBox.min,dn.min),this.boundingBox.expandByPoint(Ve),Ve.addVectors(this.boundingBox.max,dn.max),this.boundingBox.expandByPoint(Ve)):(this.boundingBox.expandByPoint(dn.min),this.boundingBox.expandByPoint(dn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&jt('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Gn);let t=this.attributes.position,e=this.morphAttributes.position;if(t&&t.isGLBufferAttribute){jt("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new H,1/0);return}if(t){let n=this.boundingSphere.center;if(dn.setFromBufferAttribute(t),e)for(let r=0,a=e.length;r<a;r++){let o=e[r];nr.setFromBufferAttribute(o),this.morphTargetsRelative?(Ve.addVectors(dn.min,nr.min),dn.expandByPoint(Ve),Ve.addVectors(dn.max,nr.max),dn.expandByPoint(Ve)):(dn.expandByPoint(nr.min),dn.expandByPoint(nr.max))}dn.getCenter(n);let s=0;for(let r=0,a=t.count;r<a;r++)Ve.fromBufferAttribute(t,r),s=Math.max(s,n.distanceToSquared(Ve));if(e)for(let r=0,a=e.length;r<a;r++){let o=e[r],l=this.morphTargetsRelative;for(let c=0,f=o.count;c<f;c++)Ve.fromBufferAttribute(o,c),l&&(ys.fromBufferAttribute(t,c),Ve.add(ys)),s=Math.max(s,n.distanceToSquared(Ve))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&jt('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let t=this.index,e=this.attributes;if(t===null||e.position===void 0||e.normal===void 0||e.uv===void 0){jt("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=e.position,s=e.normal,r=e.uv,a=this.getAttribute("tangent");(a===void 0||a.count!==n.count)&&(a=new xe(new Float32Array(4*n.count),4),this.setAttribute("tangent",a));let o=[],l=[];for(let S=0;S<n.count;S++)o[S]=new H,l[S]=new H;let c=new H,f=new H,u=new H,d=new Kt,p=new Kt,g=new Kt,y=new H,m=new H;function _(S,T,L){c.fromBufferAttribute(n,S),f.fromBufferAttribute(n,T),u.fromBufferAttribute(n,L),d.fromBufferAttribute(r,S),p.fromBufferAttribute(r,T),g.fromBufferAttribute(r,L),f.sub(c),u.sub(c),p.sub(d),g.sub(d);let N=1/(p.x*g.y-g.x*p.y);isFinite(N)&&(y.copy(f).multiplyScalar(g.y).addScaledVector(u,-p.y).multiplyScalar(N),m.copy(u).multiplyScalar(p.x).addScaledVector(f,-g.x).multiplyScalar(N),o[S].add(y),o[T].add(y),o[L].add(y),l[S].add(m),l[T].add(m),l[L].add(m))}let R=this.groups;R.length===0&&(R=[{start:0,count:t.count}]);for(let S=0,T=R.length;S<T;++S){let L=R[S],N=L.start,F=L.count;for(let Y=N,J=N+F;Y<J;Y+=3)_(t.getX(Y+0),t.getX(Y+1),t.getX(Y+2))}let w=new H,v=new H,E=new H,C=new H;function D(S){E.fromBufferAttribute(s,S),C.copy(E);let T=o[S];w.copy(T),w.sub(E.multiplyScalar(E.dot(T))).normalize(),v.crossVectors(C,T);let N=v.dot(l[S])<0?-1:1;a.setXYZW(S,w.x,w.y,w.z,N)}for(let S=0,T=R.length;S<T;++S){let L=R[S],N=L.start,F=L.count;for(let Y=N,J=N+F;Y<J;Y+=3)D(t.getX(Y+0)),D(t.getX(Y+1)),D(t.getX(Y+2))}this._transformed=!0}computeVertexNormals(){let t=this.index,e=this.getAttribute("position");if(e!==void 0){let n=this.getAttribute("normal");if(n===void 0||n.count!==e.count)n=new xe(new Float32Array(e.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let s=new H,r=new H,a=new H,o=new H,l=new H,c=new H,f=new H,u=new H;if(t)for(let d=0,p=t.count;d<p;d+=3){let g=t.getX(d+0),y=t.getX(d+1),m=t.getX(d+2);s.fromBufferAttribute(e,g),r.fromBufferAttribute(e,y),a.fromBufferAttribute(e,m),f.subVectors(a,r),u.subVectors(s,r),f.cross(u),o.fromBufferAttribute(n,g),l.fromBufferAttribute(n,y),c.fromBufferAttribute(n,m),o.add(f),l.add(f),c.add(f),n.setXYZ(g,o.x,o.y,o.z),n.setXYZ(y,l.x,l.y,l.z),n.setXYZ(m,c.x,c.y,c.z)}else for(let d=0,p=e.count;d<p;d+=3)s.fromBufferAttribute(e,d+0),r.fromBufferAttribute(e,d+1),a.fromBufferAttribute(e,d+2),f.subVectors(a,r),u.subVectors(s,r),f.cross(u),n.setXYZ(d+0,f.x,f.y,f.z),n.setXYZ(d+1,f.x,f.y,f.z),n.setXYZ(d+2,f.x,f.y,f.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let t=this.attributes.normal;for(let e=0,n=t.count;e<n;e++)Ve.fromBufferAttribute(t,e),Ve.normalize(),t.setXYZ(e,Ve.x,Ve.y,Ve.z)}toNonIndexed(){function t(o,l){let c=o.array,f=o.itemSize,u=o.normalized,d=new c.constructor(l.length*f),p=0,g=0;for(let y=0,m=l.length;y<m;y++){o.isInterleavedBufferAttribute?p=l[y]*o.data.stride+o.offset:p=l[y]*f;for(let _=0;_<f;_++)d[g++]=c[p++]}return new xe(d,f,u)}if(this.index===null)return Jt("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let e=new i,n=this.index.array,s=this.attributes;for(let o in s){let l=s[o],c=t(l,n);e.setAttribute(o,c)}let r=this.morphAttributes;for(let o in r){let l=[],c=r[o];for(let f=0,u=c.length;f<u;f++){let d=c[f],p=t(d,n);l.push(p)}e.morphAttributes[o]=l}e.morphTargetsRelative=this.morphTargetsRelative;let a=this.groups;for(let o=0,l=a.length;o<l;o++){let c=a[o];e.addGroup(c.start,c.count,c.materialIndex)}return e}toJSON(){let t={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(t.uuid=this.uuid,t.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,this.name!==""&&(t.name=this.name),Object.keys(this.userData).length>0&&(t.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){let l=this.parameters;for(let c in l)l[c]!==void 0&&(t[c]=l[c]);return t}t.data={attributes:{}};let e=this.index;e!==null&&(t.data.index={type:e.array.constructor.name,array:Array.prototype.slice.call(e.array)});let n=this.attributes;for(let l in n){let c=n[l];t.data.attributes[l]=c.toJSON(t.data)}let s={},r=!1;for(let l in this.morphAttributes){let c=this.morphAttributes[l],f=[];for(let u=0,d=c.length;u<d;u++){let p=c[u];f.push(p.toJSON(t.data))}f.length>0&&(s[l]=f,r=!0)}r&&(t.data.morphAttributes=s,t.data.morphTargetsRelative=this.morphTargetsRelative);let a=this.groups;a.length>0&&(t.data.groups=JSON.parse(JSON.stringify(a)));let o=this.boundingSphere;return o!==null&&(t.data.boundingSphere=o.toJSON()),t}clone(){return new this.constructor().copy(this)}copy(t){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let e={};this.name=t.name;let n=t.index;n!==null&&this.setIndex(n.clone());let s=t.attributes;for(let c in s){let f=s[c];this.setAttribute(c,f.clone(e))}let r=t.morphAttributes;for(let c in r){let f=[],u=r[c];for(let d=0,p=u.length;d<p;d++)f.push(u[d].clone(e));this.morphAttributes[c]=f}this.morphTargetsRelative=t.morphTargetsRelative;let a=t.groups;for(let c=0,f=a.length;c<f;c++){let u=a[c];this.addGroup(u.start,u.count,u.materialIndex)}let o=t.boundingBox;o!==null&&(this.boundingBox=o.clone());let l=t.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=t.drawRange.start,this.drawRange.count=t.drawRange.count,this.userData=t.userData,this._transformed=t._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}};var pd=0,oi=class extends Rn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:pd++}),this.uuid=Ii(),this.name="",this.type="Material",this.blending=Gi,this.side=ai,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Ba,this.blendDst=ka,this.blendEquation=bi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ie(0,0,0),this.blendAlpha=0,this.depthFunc=Hi,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Gl,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=zi,this.stencilZFail=zi,this.stencilZPass=zi,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(t){this._alphaTest>0!=t>0&&this.version++,this._alphaTest=t}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(t){if(t!==void 0)for(let e in t){let n=t[e];if(n===void 0){Jt(`Material: parameter '${e}' has value of undefined.`);continue}let s=this[e];if(s===void 0){Jt(`Material: '${e}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(n):s&&s.isVector2&&n&&n.isVector2||s&&s.isEuler&&n&&n.isEuler||s&&s.isVector3&&n&&n.isVector3?s.copy(n):this[e]=n}}toJSON(t){let e=t===void 0||typeof t=="string";e&&(t={textures:{},images:{}});let n={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(t).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(t).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(t).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(n.sheenColorMap=this.sheenColorMap.toJSON(t).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(n.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(t).uuid),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(t).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(t).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(t).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(t).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(t).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(t).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(t).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(t).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(t).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(t).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(t).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(t).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(t).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(t).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(t).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(t).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(t).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(t).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(t).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(t).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(t).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==Gi&&(n.blending=this.blending),this.side!==ai&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==Ba&&(n.blendSrc=this.blendSrc),this.blendDst!==ka&&(n.blendDst=this.blendDst),this.blendEquation!==bi&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==Hi&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==Gl&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==zi&&(n.stencilFail=this.stencilFail),this.stencilZFail!==zi&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==zi&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.allowOverride===!1&&(n.allowOverride=!1),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function s(r){let a=[];for(let o in r){let l=r[o];delete l.metadata,a.push(l)}return a}if(e){let r=s(t.textures),a=s(t.images);r.length>0&&(n.textures=r),a.length>0&&(n.images=a)}return n}fromJSON(t,e){if(t.uuid!==void 0&&(this.uuid=t.uuid),t.name!==void 0&&(this.name=t.name),t.color!==void 0&&this.color!==void 0&&this.color.setHex(t.color),t.roughness!==void 0&&(this.roughness=t.roughness),t.metalness!==void 0&&(this.metalness=t.metalness),t.sheen!==void 0&&(this.sheen=t.sheen),t.sheenColor!==void 0&&(this.sheenColor=new ie().setHex(t.sheenColor)),t.sheenRoughness!==void 0&&(this.sheenRoughness=t.sheenRoughness),t.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(t.emissive),t.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(t.specular),t.specularIntensity!==void 0&&(this.specularIntensity=t.specularIntensity),t.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(t.specularColor),t.shininess!==void 0&&(this.shininess=t.shininess),t.clearcoat!==void 0&&(this.clearcoat=t.clearcoat),t.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=t.clearcoatRoughness),t.dispersion!==void 0&&(this.dispersion=t.dispersion),t.iridescence!==void 0&&(this.iridescence=t.iridescence),t.iridescenceIOR!==void 0&&(this.iridescenceIOR=t.iridescenceIOR),t.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=t.iridescenceThicknessRange),t.transmission!==void 0&&(this.transmission=t.transmission),t.thickness!==void 0&&(this.thickness=t.thickness),t.attenuationDistance!==void 0&&(this.attenuationDistance=t.attenuationDistance),t.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(t.attenuationColor),t.anisotropy!==void 0&&(this.anisotropy=t.anisotropy),t.anisotropyRotation!==void 0&&(this.anisotropyRotation=t.anisotropyRotation),t.fog!==void 0&&(this.fog=t.fog),t.flatShading!==void 0&&(this.flatShading=t.flatShading),t.blending!==void 0&&(this.blending=t.blending),t.combine!==void 0&&(this.combine=t.combine),t.side!==void 0&&(this.side=t.side),t.shadowSide!==void 0&&(this.shadowSide=t.shadowSide),t.opacity!==void 0&&(this.opacity=t.opacity),t.transparent!==void 0&&(this.transparent=t.transparent),t.alphaTest!==void 0&&(this.alphaTest=t.alphaTest),t.alphaHash!==void 0&&(this.alphaHash=t.alphaHash),t.depthFunc!==void 0&&(this.depthFunc=t.depthFunc),t.depthTest!==void 0&&(this.depthTest=t.depthTest),t.depthWrite!==void 0&&(this.depthWrite=t.depthWrite),t.colorWrite!==void 0&&(this.colorWrite=t.colorWrite),t.blendSrc!==void 0&&(this.blendSrc=t.blendSrc),t.blendDst!==void 0&&(this.blendDst=t.blendDst),t.blendEquation!==void 0&&(this.blendEquation=t.blendEquation),t.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=t.blendSrcAlpha),t.blendDstAlpha!==void 0&&(this.blendDstAlpha=t.blendDstAlpha),t.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=t.blendEquationAlpha),t.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(t.blendColor),t.blendAlpha!==void 0&&(this.blendAlpha=t.blendAlpha),t.stencilWriteMask!==void 0&&(this.stencilWriteMask=t.stencilWriteMask),t.stencilFunc!==void 0&&(this.stencilFunc=t.stencilFunc),t.stencilRef!==void 0&&(this.stencilRef=t.stencilRef),t.stencilFuncMask!==void 0&&(this.stencilFuncMask=t.stencilFuncMask),t.stencilFail!==void 0&&(this.stencilFail=t.stencilFail),t.stencilZFail!==void 0&&(this.stencilZFail=t.stencilZFail),t.stencilZPass!==void 0&&(this.stencilZPass=t.stencilZPass),t.stencilWrite!==void 0&&(this.stencilWrite=t.stencilWrite),t.wireframe!==void 0&&(this.wireframe=t.wireframe),t.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=t.wireframeLinewidth),t.wireframeLinecap!==void 0&&(this.wireframeLinecap=t.wireframeLinecap),t.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=t.wireframeLinejoin),t.rotation!==void 0&&(this.rotation=t.rotation),t.linewidth!==void 0&&(this.linewidth=t.linewidth),t.dashSize!==void 0&&(this.dashSize=t.dashSize),t.gapSize!==void 0&&(this.gapSize=t.gapSize),t.scale!==void 0&&(this.scale=t.scale),t.polygonOffset!==void 0&&(this.polygonOffset=t.polygonOffset),t.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=t.polygonOffsetFactor),t.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=t.polygonOffsetUnits),t.dithering!==void 0&&(this.dithering=t.dithering),t.alphaToCoverage!==void 0&&(this.alphaToCoverage=t.alphaToCoverage),t.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=t.premultipliedAlpha),t.forceSinglePass!==void 0&&(this.forceSinglePass=t.forceSinglePass),t.allowOverride!==void 0&&(this.allowOverride=t.allowOverride),t.visible!==void 0&&(this.visible=t.visible),t.toneMapped!==void 0&&(this.toneMapped=t.toneMapped),t.userData!==void 0&&(this.userData=t.userData),t.vertexColors!==void 0&&(typeof t.vertexColors=="number"?this.vertexColors=t.vertexColors>0:this.vertexColors=t.vertexColors),t.size!==void 0&&(this.size=t.size),t.sizeAttenuation!==void 0&&(this.sizeAttenuation=t.sizeAttenuation),t.map!==void 0&&(this.map=e[t.map]||null),t.matcap!==void 0&&(this.matcap=e[t.matcap]||null),t.alphaMap!==void 0&&(this.alphaMap=e[t.alphaMap]||null),t.bumpMap!==void 0&&(this.bumpMap=e[t.bumpMap]||null),t.bumpScale!==void 0&&(this.bumpScale=t.bumpScale),t.normalMap!==void 0&&(this.normalMap=e[t.normalMap]||null),t.normalMapType!==void 0&&(this.normalMapType=t.normalMapType),t.normalScale!==void 0){let n=t.normalScale;Array.isArray(n)===!1&&(n=[n,n]),this.normalScale=new Kt().fromArray(n)}return t.displacementMap!==void 0&&(this.displacementMap=e[t.displacementMap]||null),t.displacementScale!==void 0&&(this.displacementScale=t.displacementScale),t.displacementBias!==void 0&&(this.displacementBias=t.displacementBias),t.roughnessMap!==void 0&&(this.roughnessMap=e[t.roughnessMap]||null),t.metalnessMap!==void 0&&(this.metalnessMap=e[t.metalnessMap]||null),t.emissiveMap!==void 0&&(this.emissiveMap=e[t.emissiveMap]||null),t.emissiveIntensity!==void 0&&(this.emissiveIntensity=t.emissiveIntensity),t.specularMap!==void 0&&(this.specularMap=e[t.specularMap]||null),t.specularIntensityMap!==void 0&&(this.specularIntensityMap=e[t.specularIntensityMap]||null),t.specularColorMap!==void 0&&(this.specularColorMap=e[t.specularColorMap]||null),t.envMap!==void 0&&(this.envMap=e[t.envMap]||null),t.envMapRotation!==void 0&&this.envMapRotation.fromArray(t.envMapRotation),t.envMapIntensity!==void 0&&(this.envMapIntensity=t.envMapIntensity),t.reflectivity!==void 0&&(this.reflectivity=t.reflectivity),t.refractionRatio!==void 0&&(this.refractionRatio=t.refractionRatio),t.lightMap!==void 0&&(this.lightMap=e[t.lightMap]||null),t.lightMapIntensity!==void 0&&(this.lightMapIntensity=t.lightMapIntensity),t.aoMap!==void 0&&(this.aoMap=e[t.aoMap]||null),t.aoMapIntensity!==void 0&&(this.aoMapIntensity=t.aoMapIntensity),t.gradientMap!==void 0&&(this.gradientMap=e[t.gradientMap]||null),t.clearcoatMap!==void 0&&(this.clearcoatMap=e[t.clearcoatMap]||null),t.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=e[t.clearcoatRoughnessMap]||null),t.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=e[t.clearcoatNormalMap]||null),t.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Kt().fromArray(t.clearcoatNormalScale)),t.iridescenceMap!==void 0&&(this.iridescenceMap=e[t.iridescenceMap]||null),t.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=e[t.iridescenceThicknessMap]||null),t.transmissionMap!==void 0&&(this.transmissionMap=e[t.transmissionMap]||null),t.thicknessMap!==void 0&&(this.thicknessMap=e[t.thicknessMap]||null),t.anisotropyMap!==void 0&&(this.anisotropyMap=e[t.anisotropyMap]||null),t.sheenColorMap!==void 0&&(this.sheenColorMap=e[t.sheenColorMap]||null),t.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=e[t.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(t){this.name=t.name,this.blending=t.blending,this.side=t.side,this.vertexColors=t.vertexColors,this.opacity=t.opacity,this.transparent=t.transparent,this.blendSrc=t.blendSrc,this.blendDst=t.blendDst,this.blendEquation=t.blendEquation,this.blendSrcAlpha=t.blendSrcAlpha,this.blendDstAlpha=t.blendDstAlpha,this.blendEquationAlpha=t.blendEquationAlpha,this.blendColor.copy(t.blendColor),this.blendAlpha=t.blendAlpha,this.depthFunc=t.depthFunc,this.depthTest=t.depthTest,this.depthWrite=t.depthWrite,this.stencilWriteMask=t.stencilWriteMask,this.stencilFunc=t.stencilFunc,this.stencilRef=t.stencilRef,this.stencilFuncMask=t.stencilFuncMask,this.stencilFail=t.stencilFail,this.stencilZFail=t.stencilZFail,this.stencilZPass=t.stencilZPass,this.stencilWrite=t.stencilWrite;let e=t.clippingPlanes,n=null;if(e!==null){let s=e.length;n=new Array(s);for(let r=0;r!==s;++r)n[r]=e[r].clone()}return this.clippingPlanes=n,this.clipIntersection=t.clipIntersection,this.clipShadows=t.clipShadows,this.shadowSide=t.shadowSide,this.colorWrite=t.colorWrite,this.precision=t.precision,this.polygonOffset=t.polygonOffset,this.polygonOffsetFactor=t.polygonOffsetFactor,this.polygonOffsetUnits=t.polygonOffsetUnits,this.dithering=t.dithering,this.alphaTest=t.alphaTest,this.alphaHash=t.alphaHash,this.alphaToCoverage=t.alphaToCoverage,this.premultipliedAlpha=t.premultipliedAlpha,this.forceSinglePass=t.forceSinglePass,this.allowOverride=t.allowOverride,this.visible=t.visible,this.toneMapped=t.toneMapped,this.userData=JSON.parse(JSON.stringify(t.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(t){t===!0&&this.version++}};var ni=new H,Rl=new H,va=new H,vi=new H,Pl=new H,Sa=new H,Il=new H,qi=class{constructor(t=new H,e=new H(0,0,-1)){this.origin=t,this.direction=e}set(t,e){return this.origin.copy(t),this.direction.copy(e),this}copy(t){return this.origin.copy(t.origin),this.direction.copy(t.direction),this}at(t,e){return e.copy(this.origin).addScaledVector(this.direction,t)}lookAt(t){return this.direction.copy(t).sub(this.origin).normalize(),this}recast(t){return this.origin.copy(this.at(t,ni)),this}closestPointToPoint(t,e){e.subVectors(t,this.origin);let n=e.dot(this.direction);return n<0?e.copy(this.origin):e.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(t){return Math.sqrt(this.distanceSqToPoint(t))}distanceSqToPoint(t){let e=ni.subVectors(t,this.origin).dot(this.direction);return e<0?this.origin.distanceToSquared(t):(ni.copy(this.origin).addScaledVector(this.direction,e),ni.distanceToSquared(t))}distanceSqToSegment(t,e,n,s){Rl.copy(t).add(e).multiplyScalar(.5),va.copy(e).sub(t).normalize(),vi.copy(this.origin).sub(Rl);let r=t.distanceTo(e)*.5,a=-this.direction.dot(va),o=vi.dot(this.direction),l=-vi.dot(va),c=vi.lengthSq(),f=Math.abs(1-a*a),u,d,p,g;if(f>0)if(u=a*l-o,d=a*o-l,g=r*f,u>=0)if(d>=-g)if(d<=g){let y=1/f;u*=y,d*=y,p=u*(u+a*d+2*o)+d*(a*u+d+2*l)+c}else d=r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d=-r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;else d<=-g?(u=Math.max(0,-(-a*r+o)),d=u>0?-r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c):d<=g?(u=0,d=Math.min(Math.max(-r,-l),r),p=d*(d+2*l)+c):(u=Math.max(0,-(a*r+o)),d=u>0?r:Math.min(Math.max(-r,-l),r),p=-u*u+d*(d+2*l)+c);else d=a>0?-r:r,u=Math.max(0,-(a*d+o)),p=-u*u+d*(d+2*l)+c;return n&&n.copy(this.origin).addScaledVector(this.direction,u),s&&s.copy(Rl).addScaledVector(va,d),p}intersectSphere(t,e){ni.subVectors(t.center,this.origin);let n=ni.dot(this.direction),s=ni.dot(ni)-n*n,r=t.radius*t.radius;if(s>r)return null;let a=Math.sqrt(r-s),o=n-a,l=n+a;return l<0?null:o<0?this.at(l,e):this.at(o,e)}intersectsSphere(t){return t.radius<0?!1:this.distanceSqToPoint(t.center)<=t.radius*t.radius}distanceToPlane(t){let e=t.normal.dot(this.direction);if(e===0)return t.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(t.normal)+t.constant)/e;return n>=0?n:null}intersectPlane(t,e){let n=this.distanceToPlane(t);return n===null?null:this.at(n,e)}intersectsPlane(t){let e=t.distanceToPoint(this.origin);return e===0||t.normal.dot(this.direction)*e<0}intersectBox(t,e){let n,s,r,a,o,l,c=1/this.direction.x,f=1/this.direction.y,u=1/this.direction.z,d=this.origin;return c>=0?(n=(t.min.x-d.x)*c,s=(t.max.x-d.x)*c):(n=(t.max.x-d.x)*c,s=(t.min.x-d.x)*c),f>=0?(r=(t.min.y-d.y)*f,a=(t.max.y-d.y)*f):(r=(t.max.y-d.y)*f,a=(t.min.y-d.y)*f),n>a||r>s||((r>n||isNaN(n))&&(n=r),(a<s||isNaN(s))&&(s=a),u>=0?(o=(t.min.z-d.z)*u,l=(t.max.z-d.z)*u):(o=(t.max.z-d.z)*u,l=(t.min.z-d.z)*u),n>l||o>s)||((o>n||n!==n)&&(n=o),(l<s||s!==s)&&(s=l),s<0)?null:this.at(n>=0?n:s,e)}intersectsBox(t){return this.intersectBox(t,ni)!==null}intersectTriangle(t,e,n,s,r){Pl.subVectors(e,t),Sa.subVectors(n,t),Il.crossVectors(Pl,Sa);let a=this.direction.dot(Il),o;if(a>0){if(s)return null;o=1}else if(a<0)o=-1,a=-a;else return null;vi.subVectors(this.origin,t);let l=o*this.direction.dot(Sa.crossVectors(vi,Sa));if(l<0)return null;let c=o*this.direction.dot(Pl.cross(vi));if(c<0||l+c>a)return null;let f=-o*vi.dot(Il);return f<0?null:this.at(f/a,r)}applyMatrix4(t){return this.origin.applyMatrix4(t),this.direction.transformDirection(t),this}equals(t){return t.origin.equals(this.origin)&&t.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},gr=class extends oi{constructor(t){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ie(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new gn,this.combine=ho,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.fog=t.fog,this}},Eh=new se,Bi=new qi,Ma=new Gn,Ch=new H,ba=new H,wa=new H,Aa=new H,Dl=new H,Ta=new H,Rh=new H,Ea=new H,ve=class extends we{constructor(t=new tn,e=new gr){super(),this.isMesh=!0,this.type="Mesh",this.geometry=t,this.material=e,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(t,e){return super.copy(t,e),t.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=t.morphTargetInfluences.slice()),t.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},t.morphTargetDictionary)),this.material=Array.isArray(t.material)?t.material.slice():t.material,this.geometry=t.geometry,this}updateMorphTargets(){let e=this.geometry.morphAttributes,n=Object.keys(e);if(n.length>0){let s=e[n[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,a=s.length;r<a;r++){let o=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=r}}}}getVertexPosition(t,e){let n=this.geometry,s=n.attributes.position,r=n.morphAttributes.position,a=n.morphTargetsRelative;e.fromBufferAttribute(s,t);let o=this.morphTargetInfluences;if(r&&o){Ta.set(0,0,0);for(let l=0,c=r.length;l<c;l++){let f=o[l],u=r[l];f!==0&&(Dl.fromBufferAttribute(u,t),a?Ta.addScaledVector(Dl,f):Ta.addScaledVector(Dl.sub(e),f))}e.add(Ta)}return e}raycast(t,e){let n=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Ma.copy(n.boundingSphere),Ma.applyMatrix4(r),Bi.copy(t.ray).recast(t.near),!(Ma.containsPoint(Bi.origin)===!1&&(Bi.intersectSphere(Ma,Ch)===null||Bi.origin.distanceToSquared(Ch)>(t.far-t.near)**2))&&(Eh.copy(r).invert(),Bi.copy(t.ray).applyMatrix4(Eh),!(n.boundingBox!==null&&Bi.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(t,e,Bi)))}_computeIntersections(t,e,n){let s,r=this.geometry,a=this.material,o=r.index,l=r.attributes.position,c=r.attributes.uv,f=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(o!==null)if(Array.isArray(a))for(let g=0,y=d.length;g<y;g++){let m=d[g],_=a[m.materialIndex],R=Math.max(m.start,p.start),w=Math.min(o.count,Math.min(m.start+m.count,p.start+p.count));for(let v=R,E=w;v<E;v+=3){let C=o.getX(v),D=o.getX(v+1),S=o.getX(v+2);s=Ca(this,_,t,n,c,f,u,C,D,S),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,p.start),y=Math.min(o.count,p.start+p.count);for(let m=g,_=y;m<_;m+=3){let R=o.getX(m),w=o.getX(m+1),v=o.getX(m+2);s=Ca(this,a,t,n,c,f,u,R,w,v),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}else if(l!==void 0)if(Array.isArray(a))for(let g=0,y=d.length;g<y;g++){let m=d[g],_=a[m.materialIndex],R=Math.max(m.start,p.start),w=Math.min(l.count,Math.min(m.start+m.count,p.start+p.count));for(let v=R,E=w;v<E;v+=3){let C=v,D=v+1,S=v+2;s=Ca(this,_,t,n,c,f,u,C,D,S),s&&(s.faceIndex=Math.floor(v/3),s.face.materialIndex=m.materialIndex,e.push(s))}}else{let g=Math.max(0,p.start),y=Math.min(l.count,p.start+p.count);for(let m=g,_=y;m<_;m+=3){let R=m,w=m+1,v=m+2;s=Ca(this,a,t,n,c,f,u,R,w,v),s&&(s.faceIndex=Math.floor(m/3),e.push(s))}}}};function md(i,t,e,n,s,r,a,o){let l;if(t.side===Xe?l=n.intersectTriangle(a,r,s,!0,o):l=n.intersectTriangle(s,r,a,t.side===ai,o),l===null)return null;Ea.copy(o),Ea.applyMatrix4(i.matrixWorld);let c=e.ray.origin.distanceTo(Ea);return c<e.near||c>e.far?null:{distance:c,point:Ea.clone(),object:i}}function Ca(i,t,e,n,s,r,a,o,l,c){i.getVertexPosition(o,ba),i.getVertexPosition(l,wa),i.getVertexPosition(c,Aa);let f=md(i,t,e,n,ba,wa,Aa,Rh);if(f){let u=new H;Mi.getBarycoord(Rh,ba,wa,Aa,u),s&&(f.uv=Mi.getInterpolatedAttribute(s,o,l,c,u,new Kt)),r&&(f.uv1=Mi.getInterpolatedAttribute(r,o,l,c,u,new Kt)),a&&(f.normal=Mi.getInterpolatedAttribute(a,o,l,c,u,new H),f.normal.dot(n.direction)>0&&f.normal.multiplyScalar(-1));let d={a:o,b:l,c,normal:new H,materialIndex:0};Mi.getNormal(ba,wa,Aa,d.normal),f.face=d,f.barycoord=u}return f}var ir=new ge,Ph=new ge,Ih=new ge,gd=new ge,Dh=new se,Ra=new H,Ul=new Gn,Uh=new se,Ll=new qi,_r=class extends ve{constructor(t,e){super(t,e),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=Ol,this.bindMatrix=new se,this.bindMatrixInverse=new se,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let t=this.geometry;this.boundingBox===null&&(this.boundingBox=new bn),this.boundingBox.makeEmpty();let e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Ra),this.boundingBox.expandByPoint(Ra)}computeBoundingSphere(){let t=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new Gn),this.boundingSphere.makeEmpty();let e=t.getAttribute("position");for(let n=0;n<e.count;n++)this.getVertexPosition(n,Ra),this.boundingSphere.expandByPoint(Ra)}copy(t,e){return super.copy(t,e),this.bindMode=t.bindMode,this.bindMatrix.copy(t.bindMatrix),this.bindMatrixInverse.copy(t.bindMatrixInverse),this.skeleton=t.skeleton,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}raycast(t,e){let n=this.material,s=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Ul.copy(this.boundingSphere),Ul.applyMatrix4(s),t.ray.intersectsSphere(Ul)!==!1&&(Uh.copy(s).invert(),Ll.copy(t.ray).applyMatrix4(Uh),!(this.boundingBox!==null&&Ll.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(t,e,Ll)))}getVertexPosition(t,e){return super.getVertexPosition(t,e),this.applyBoneTransform(t,e),e}bind(t,e){this.skeleton=t,e===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),e=this.matrixWorld),this.bindMatrix.copy(e),this.bindMatrixInverse.copy(e).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let t=new ge,e=this.geometry.attributes.skinWeight;for(let n=0,s=e.count;n<s;n++){t.fromBufferAttribute(e,n);let r=1/t.manhattanLength();r!==1/0?t.multiplyScalar(r):t.set(1,0,0,0),e.setXYZW(n,t.x,t.y,t.z,t.w)}}updateMatrixWorld(t){super.updateMatrixWorld(t),this.bindMode===Ol?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===gu?this.bindMatrixInverse.copy(this.bindMatrix).invert():Jt("SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(t,e){let n=this.skeleton,s=this.geometry;Ph.fromBufferAttribute(s.attributes.skinIndex,t),Ih.fromBufferAttribute(s.attributes.skinWeight,t),e.isVector4?(ir.copy(e),e.set(0,0,0,0)):(ir.set(...e,1),e.set(0,0,0)),ir.applyMatrix4(this.bindMatrix);for(let r=0;r<4;r++){let a=Ih.getComponent(r);if(a!==0){let o=Ph.getComponent(r);Dh.multiplyMatrices(n.bones[o].matrixWorld,n.boneInverses[o]),e.addScaledVector(gd.copy(ir).applyMatrix4(Dh),a)}}return e.isVector4&&(e.w=ir.w),e.applyMatrix4(this.bindMatrixInverse)}},Is=class extends we{constructor(){super(),this.isBone=!0,this.type="Bone"}},wi=class extends Qe{constructor(t=null,e=1,n=1,s,r,a,o,l,c=He,f=He,u,d){super(null,a,o,l,c,f,s,r,u,d),this.isDataTexture=!0,this.image={data:t,width:e,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Lh=new se,_d=new se,xr=class i{constructor(t=[],e=[]){this.uuid=Ii(),this.bones=t.slice(0),this.boneInverses=e,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let t=this.bones,e=this.boneInverses;if(this.boneMatrices=new Float32Array(t.length*16),e.length===0)this.calculateInverses();else if(t.length!==e.length){Jt("Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,s=this.bones.length;n<s;n++)this.boneInverses.push(new se)}}calculateInverses(){this.boneInverses.length=0;for(let t=0,e=this.bones.length;t<e;t++){let n=new se;this.bones[t]&&n.copy(this.bones[t].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let t=0,e=this.bones.length;t<e;t++){let n=this.bones[t];n&&n.matrixWorld.copy(this.boneInverses[t]).invert()}for(let t=0,e=this.bones.length;t<e;t++){let n=this.bones[t];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let t=this.bones,e=this.boneInverses,n=this.boneMatrices,s=this.boneTexture;for(let r=0,a=t.length;r<a;r++){let o=t[r]?t[r].matrixWorld:_d;Lh.multiplyMatrices(o,e[r]),Lh.toArray(n,r*16)}s!==null&&(s.needsUpdate=!0)}clone(){return new i(this.bones,this.boneInverses)}computeBoneTexture(){let t=Math.sqrt(this.bones.length*4);t=Math.ceil(t/4)*4,t=Math.max(t,4);let e=new Float32Array(t*t*4);e.set(this.boneMatrices);let n=new wi(e,t,t,Le,qe);return n.needsUpdate=!0,this.boneMatrices=e,this.boneTexture=n,this}getBoneByName(t){for(let e=0,n=this.bones.length;e<n;e++){let s=this.bones[e];if(s.name===t)return s}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(t,e){this.uuid=t.uuid;for(let n=0,s=t.bones.length;n<s;n++){let r=t.bones[n],a=e[r];a===void 0&&(Jt("Skeleton: No bone found with UUID:",r),a=new Is),this.bones.push(a),this.boneInverses.push(new se().fromArray(t.boneInverses[n]))}return this.init(),this}toJSON(){let t={metadata:{version:4.7,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};t.uuid=this.uuid;let e=this.bones,n=this.boneInverses;for(let s=0,r=e.length;s<r;s++){let a=e[s];t.bones.push(a.uuid);let o=n[s];t.boneInverses.push(o.toArray())}return t}},yr=class extends xe{constructor(t,e,n,s=1){super(t,e,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(t){return super.copy(t),this.meshPerAttribute=t.meshPerAttribute,this}toJSON(){let t=super.toJSON();return t.meshPerAttribute=this.meshPerAttribute,t.isInstancedBufferAttribute=!0,t}},vs=new se,Nh=new se,Pa=[],Fh=new bn,xd=new se,sr=new ve,rr=new Gn,vr=class extends ve{constructor(t,e,n){super(t,e),this.isInstancedMesh=!0,this.instanceMatrix=new yr(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<n;s++)this.setMatrixAt(s,xd)}computeBoundingBox(){let t=this.geometry,e=this.count;this.boundingBox===null&&(this.boundingBox=new bn),t.boundingBox===null&&t.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,vs),Fh.copy(t.boundingBox).applyMatrix4(vs),this.boundingBox.union(Fh)}computeBoundingSphere(){let t=this.geometry,e=this.count;this.boundingSphere===null&&(this.boundingSphere=new Gn),t.boundingSphere===null&&t.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<e;n++)this.getMatrixAt(n,vs),rr.copy(t.boundingSphere).applyMatrix4(vs),this.boundingSphere.union(rr)}copy(t,e){return super.copy(t,e),this.instanceMatrix.copy(t.instanceMatrix),t.morphTexture!==null&&(this.morphTexture=t.morphTexture.clone()),t.instanceColor!==null&&(this.instanceColor=t.instanceColor.clone()),this.count=t.count,t.boundingBox!==null&&(this.boundingBox=t.boundingBox.clone()),t.boundingSphere!==null&&(this.boundingSphere=t.boundingSphere.clone()),this}getColorAt(t,e){return this.instanceColor===null?e.setRGB(1,1,1):e.fromArray(this.instanceColor.array,t*3)}getMatrixAt(t,e){return e.fromArray(this.instanceMatrix.array,t*16)}getMorphAt(t,e){let n=e.morphTargetInfluences,s=this.morphTexture.source.data.data,r=n.length+1,a=t*r+1;for(let o=0;o<n.length;o++)n[o]=s[a+o]}raycast(t,e){let n=this.matrixWorld,s=this.count;if(sr.geometry=this.geometry,sr.material=this.material,sr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),rr.copy(this.boundingSphere),rr.applyMatrix4(n),t.ray.intersectsSphere(rr)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,vs),Nh.multiplyMatrices(n,vs),sr.matrixWorld=Nh,sr.raycast(t,Pa);for(let a=0,o=Pa.length;a<o;a++){let l=Pa[a];l.instanceId=r,l.object=this,e.push(l)}Pa.length=0}}setColorAt(t,e){return this.instanceColor===null&&(this.instanceColor=new yr(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),e.toArray(this.instanceColor.array,t*3),this}setMatrixAt(t,e){return e.toArray(this.instanceMatrix.array,t*16),this}setMorphAt(t,e){let n=e.morphTargetInfluences,s=n.length+1;this.morphTexture===null&&(this.morphTexture=new wi(new Float32Array(s*this.count),s,this.count,di,qe));let r=this.morphTexture.source.data.data,a=0;for(let c=0;c<n.length;c++)a+=n[c];let o=this.geometry.morphTargetsRelative?1:1-a,l=s*t;return r[l]=o,r.set(n,l+1),this}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},Nl=new H,yd=new H,vd=new ne,Mn=class{constructor(t=new H(1,0,0),e=0){this.isPlane=!0,this.normal=t,this.constant=e}set(t,e){return this.normal.copy(t),this.constant=e,this}setComponents(t,e,n,s){return this.normal.set(t,e,n),this.constant=s,this}setFromNormalAndCoplanarPoint(t,e){return this.normal.copy(t),this.constant=-e.dot(this.normal),this}setFromCoplanarPoints(t,e,n){let s=Nl.subVectors(n,e).cross(yd.subVectors(t,e)).normalize();return this.setFromNormalAndCoplanarPoint(s,t),this}copy(t){return this.normal.copy(t.normal),this.constant=t.constant,this}normalize(){let t=1/this.normal.length();return this.normal.multiplyScalar(t),this.constant*=t,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(t){return this.normal.dot(t)+this.constant}distanceToSphere(t){return this.distanceToPoint(t.center)-t.radius}projectPoint(t,e){return e.copy(t).addScaledVector(this.normal,-this.distanceToPoint(t))}intersectLine(t,e,n=!0){let s=t.delta(Nl),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(t.start)===0?e.copy(t.start):null;let a=-(t.start.dot(this.normal)+this.constant)/r;return n===!0&&(a<0||a>1)?null:e.copy(t.start).addScaledVector(s,a)}intersectsLine(t){let e=this.distanceToPoint(t.start),n=this.distanceToPoint(t.end);return e<0&&n>0||n<0&&e>0}intersectsBox(t){return t.intersectsPlane(this)}intersectsSphere(t){return t.intersectsPlane(this)}coplanarPoint(t){return t.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(t,e){let n=e||vd.getNormalMatrix(t),s=this.coplanarPoint(Nl).applyMatrix4(t),r=this.normal.applyMatrix3(n).normalize();return this.constant=-s.dot(r),this}translate(t){return this.constant-=t.dot(this.normal),this}equals(t){return t.normal.equals(this.normal)&&t.constant===this.constant}clone(){return new this.constructor().copy(this)}},ki=new Gn,Sd=new Kt(.5,.5),Ia=new H,Ds=class{constructor(t=new Mn,e=new Mn,n=new Mn,s=new Mn,r=new Mn,a=new Mn){this.planes=[t,e,n,s,r,a]}set(t,e,n,s,r,a){let o=this.planes;return o[0].copy(t),o[1].copy(e),o[2].copy(n),o[3].copy(s),o[4].copy(r),o[5].copy(a),this}copy(t){let e=this.planes;for(let n=0;n<6;n++)e[n].copy(t.planes[n]);return this}setFromProjectionMatrix(t,e=Cn,n=!1){let s=this.planes,r=t.elements,a=r[0],o=r[1],l=r[2],c=r[3],f=r[4],u=r[5],d=r[6],p=r[7],g=r[8],y=r[9],m=r[10],_=r[11],R=r[12],w=r[13],v=r[14],E=r[15];if(s[0].setComponents(c-a,p-f,_-g,E-R).normalize(),s[1].setComponents(c+a,p+f,_+g,E+R).normalize(),s[2].setComponents(c+o,p+u,_+y,E+w).normalize(),s[3].setComponents(c-o,p-u,_-y,E-w).normalize(),n)s[4].setComponents(l,d,m,v).normalize(),s[5].setComponents(c-l,p-d,_-m,E-v).normalize();else if(s[4].setComponents(c-l,p-d,_-m,E-v).normalize(),e===Cn)s[5].setComponents(c+l,p+d,_+m,E+v).normalize();else if(e===Ts)s[5].setComponents(l,d,m,v).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+e);return this}intersectsObject(t){if(t.boundingSphere!==void 0)t.boundingSphere===null&&t.computeBoundingSphere(),ki.copy(t.boundingSphere).applyMatrix4(t.matrixWorld);else{let e=t.geometry;e.boundingSphere===null&&e.computeBoundingSphere(),ki.copy(e.boundingSphere).applyMatrix4(t.matrixWorld)}return this.intersectsSphere(ki)}intersectsSprite(t){ki.center.set(0,0,0);let e=Sd.distanceTo(t.center);return ki.radius=.7071067811865476+e,ki.applyMatrix4(t.matrixWorld),this.intersectsSphere(ki)}intersectsSphere(t){let e=this.planes,n=t.center,s=-t.radius;for(let r=0;r<6;r++)if(e[r].distanceToPoint(n)<s)return!1;return!0}intersectsBox(t){let e=this.planes;for(let n=0;n<6;n++){let s=e[n];if(Ia.x=s.normal.x>0?t.max.x:t.min.x,Ia.y=s.normal.y>0?t.max.y:t.min.y,Ia.z=s.normal.z>0?t.max.z:t.min.z,s.distanceToPoint(Ia)<0)return!1}return!0}containsPoint(t){let e=this.planes;for(let n=0;n<6;n++)if(e[n].distanceToPoint(t)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var Sr=class extends Qe{constructor(t=[],e=Ri,n,s,r,a,o,l,c,f){super(t,e,n,s,r,a,o,l,c,f),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(t){this.image=t}};var li=class extends Qe{constructor(t,e,n=Un,s,r,a,o=He,l=He,c,f=Vn,u=1){if(f!==Vn&&f!==Pi)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");let d={width:t,height:e,depth:u};super(d,s,r,a,o,l,f,n,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(t){return super.copy(t),this.source=new Cs(Object.assign({},t.image)),this.compareFunction=t.compareFunction,this}toJSON(t){let e=super.toJSON(t);return this.compareFunction!==null&&(e.compareFunction=this.compareFunction),e}},$a=class extends li{constructor(t,e=Un,n=Ri,s,r,a=He,o=He,l,c=Vn){let f={width:t,height:t,depth:1},u=[f,f,f,f,f,f];super(t,t,e,n,s,r,a,o,l,c),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(t){this.image=t}},Mr=class extends Qe{constructor(t=null){super(),this.sourceTexture=t,this.isExternalTexture=!0}copy(t){return super.copy(t),this.sourceTexture=t.sourceTexture,this}},Hn=class i extends tn{constructor(t=1,e=1,n=1,s=1,r=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:t,height:e,depth:n,widthSegments:s,heightSegments:r,depthSegments:a};let o=this;s=Math.floor(s),r=Math.floor(r),a=Math.floor(a);let l=[],c=[],f=[],u=[],d=0,p=0;g("z","y","x",-1,-1,n,e,t,a,r,0),g("z","y","x",1,-1,n,e,-t,a,r,1),g("x","z","y",1,1,t,n,e,s,a,2),g("x","z","y",1,-1,t,n,-e,s,a,3),g("x","y","z",1,-1,t,e,n,s,r,4),g("x","y","z",-1,-1,t,e,-n,s,r,5),this.setIndex(l),this.setAttribute("position",new Ue(c,3)),this.setAttribute("normal",new Ue(f,3)),this.setAttribute("uv",new Ue(u,2));function g(y,m,_,R,w,v,E,C,D,S,T){let L=v/D,N=E/S,F=v/2,Y=E/2,J=C/2,O=D+1,K=S+1,Z=0,st=0,lt=new H;for(let St=0;St<K;St++){let mt=St*N-Y;for(let vt=0;vt<O;vt++){let qt=vt*L-F;lt[y]=qt*R,lt[m]=mt*w,lt[_]=J,c.push(lt.x,lt.y,lt.z),lt[y]=0,lt[m]=0,lt[_]=C>0?1:-1,f.push(lt.x,lt.y,lt.z),u.push(vt/D),u.push(1-St/S),Z+=1}}for(let St=0;St<S;St++)for(let mt=0;mt<D;mt++){let vt=d+mt+O*St,qt=d+mt+O*(St+1),Qt=d+(mt+1)+O*(St+1),kt=d+(mt+1)+O*St;l.push(vt,qt,kt),l.push(qt,Qt,kt),st+=6}o.addGroup(p,st,T),p+=st,d+=Z}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.depth,t.widthSegments,t.heightSegments,t.depthSegments)}},br=class i extends tn{constructor(t=1,e=1,n=4,s=8,r=1){super(),this.type="CapsuleGeometry",this.parameters={radius:t,height:e,capSegments:n,radialSegments:s,heightSegments:r},e=Math.max(0,e),n=Math.max(1,Math.floor(n)),s=Math.max(3,Math.floor(s)),r=Math.max(1,Math.floor(r));let a=[],o=[],l=[],c=[],f=e/2,u=Math.PI/2*t,d=e,p=2*u+d,g=n*2+r,y=s+1,m=new H,_=new H;for(let R=0;R<=g;R++){let w=0,v=0,E=0,C=0;if(R<=n){let T=R/n,L=T*Math.PI/2;v=-f-t*Math.cos(L),E=t*Math.sin(L),C=-t*Math.cos(L),w=T*u}else if(R<=n+r){let T=(R-n)/r;v=-f+T*e,E=t,C=0,w=u+T*d}else{let T=(R-n-r)/n,L=T*Math.PI/2;v=f+t*Math.sin(L),E=t*Math.cos(L),C=t*Math.sin(L),w=u+d+T*u}let D=Math.max(0,Math.min(1,w/p)),S=0;R===0?S=.5/s:R===g&&(S=-.5/s);for(let T=0;T<=s;T++){let L=T/s,N=L*Math.PI*2,F=Math.sin(N),Y=Math.cos(N);_.x=-E*Y,_.y=v,_.z=E*F,o.push(_.x,_.y,_.z),m.set(-E*Y,C,E*F),m.normalize(),l.push(m.x,m.y,m.z),c.push(L+S,D)}if(R>0){let T=(R-1)*y;for(let L=0;L<s;L++){let N=T+L,F=T+L+1,Y=R*y+L,J=R*y+L+1;a.push(N,F,Y),a.push(F,J,Y)}}}this.setIndex(a),this.setAttribute("position",new Ue(o,3)),this.setAttribute("normal",new Ue(l,3)),this.setAttribute("uv",new Ue(c,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.height,t.capSegments,t.radialSegments,t.heightSegments)}};var Us=class i extends tn{constructor(t=1,e=1,n=1,s=32,r=1,a=!1,o=0,l=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:t,radiusBottom:e,height:n,radialSegments:s,heightSegments:r,openEnded:a,thetaStart:o,thetaLength:l};let c=this;s=Math.floor(s),r=Math.floor(r);let f=[],u=[],d=[],p=[],g=0,y=[],m=n/2,_=0;R(),a===!1&&(t>0&&w(!0),e>0&&w(!1)),this.setIndex(f),this.setAttribute("position",new Ue(u,3)),this.setAttribute("normal",new Ue(d,3)),this.setAttribute("uv",new Ue(p,2));function R(){let v=new H,E=new H,C=0,D=(e-t)/n;for(let S=0;S<=r;S++){let T=[],L=S/r,N=L*(e-t)+t;for(let F=0;F<=s;F++){let Y=F/s,J=Y*l+o,O=Math.sin(J),K=Math.cos(J);E.x=N*O,E.y=-L*n+m,E.z=N*K,u.push(E.x,E.y,E.z),v.set(O,D,K).normalize(),d.push(v.x,v.y,v.z),p.push(Y,1-L),T.push(g++)}y.push(T)}for(let S=0;S<s;S++)for(let T=0;T<r;T++){let L=y[T][S],N=y[T+1][S],F=y[T+1][S+1],Y=y[T][S+1];(t>0||T!==0)&&(f.push(L,N,Y),C+=3),(e>0||T!==r-1)&&(f.push(N,F,Y),C+=3)}c.addGroup(_,C,0),_+=C}function w(v){let E=g,C=new Kt,D=new H,S=0,T=v===!0?t:e,L=v===!0?1:-1;for(let F=1;F<=s;F++)u.push(0,m*L,0),d.push(0,L,0),p.push(.5,.5),g++;let N=g;for(let F=0;F<=s;F++){let J=F/s*l+o,O=Math.cos(J),K=Math.sin(J);D.x=T*K,D.y=m*L,D.z=T*O,u.push(D.x,D.y,D.z),d.push(0,L,0),C.x=O*.5+.5,C.y=K*.5*L+.5,p.push(C.x,C.y),g++}for(let F=0;F<s;F++){let Y=E+F,J=N+F;v===!0?f.push(J,J+1,Y):f.push(J+1,J,Y),S+=3}c.addGroup(_,S,v===!0?1:2),_+=S}}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radiusTop,t.radiusBottom,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}},wr=class i extends Us{constructor(t=1,e=1,n=32,s=1,r=!1,a=0,o=Math.PI*2){super(0,t,e,n,s,r,a,o),this.type="ConeGeometry",this.parameters={radius:t,height:e,radialSegments:n,heightSegments:s,openEnded:r,thetaStart:a,thetaLength:o}}static fromJSON(t){return new i(t.radius,t.height,t.radialSegments,t.heightSegments,t.openEnded,t.thetaStart,t.thetaLength)}};function Md(i,t,e=2){let n=t&&t.length,s=n?t[0]*e:i.length,r=Du(i,0,s,e,!0),a=[];if(!r||r.next===r.prev)return a;let o,l,c;if(n&&(r=Ed(i,t,r,e)),i.length>80*e){o=i[0],l=i[1];let f=o,u=l;for(let d=e;d<s;d+=e){let p=i[d],g=i[d+1];p<o&&(o=p),g<l&&(l=g),p>f&&(f=p),g>u&&(u=g)}c=Math.max(f-o,u-l),c=c!==0?32767/c:0}return Ar(r,a,e,o,l,c,0),a}function Du(i,t,e,n,s){let r;if(s===Bd(i,t,e,n)>0)for(let a=t;a<e;a+=n)r=Oh(a/n|0,i[a],i[a+1],r);else for(let a=e-n;a>=t;a-=n)r=Oh(a/n|0,i[a],i[a+1],r);return r&&Ls(r,r.next)&&(Er(r),r=r.next),r}function Yi(i,t){if(!i)return i;t||(t=i);let e=i,n;do if(n=!1,!e.steiner&&(Ls(e,e.next)||Ae(e.prev,e,e.next)===0)){if(Er(e),e=t=e.prev,e===e.next)break;n=!0}else e=e.next;while(n||e!==t);return t}function Ar(i,t,e,n,s,r,a){if(!i)return;!a&&r&&Dd(i,n,s,r);let o=i;for(;i.prev!==i.next;){let l=i.prev,c=i.next;if(r?wd(i,n,s,r):bd(i)){t.push(l.i,i.i,c.i),Er(i),i=c.next,o=c.next;continue}if(i=c,i===o){a?a===1?(i=Ad(Yi(i),t),Ar(i,t,e,n,s,r,2)):a===2&&Td(i,t,e,n,s,r):Ar(Yi(i),t,e,n,s,r,1);break}}}function bd(i){let t=i.prev,e=i,n=i.next;if(Ae(t,e,n)>=0)return!1;let s=t.x,r=e.x,a=n.x,o=t.y,l=e.y,c=n.y,f=Math.min(s,r,a),u=Math.min(o,l,c),d=Math.max(s,r,a),p=Math.max(o,l,c),g=n.next;for(;g!==t;){if(g.x>=f&&g.x<=d&&g.y>=u&&g.y<=p&&ar(s,o,r,l,a,c,g.x,g.y)&&Ae(g.prev,g,g.next)>=0)return!1;g=g.next}return!0}function wd(i,t,e,n){let s=i.prev,r=i,a=i.next;if(Ae(s,r,a)>=0)return!1;let o=s.x,l=r.x,c=a.x,f=s.y,u=r.y,d=a.y,p=Math.min(o,l,c),g=Math.min(f,u,d),y=Math.max(o,l,c),m=Math.max(f,u,d),_=Wl(p,g,t,e,n),R=Wl(y,m,t,e,n),w=i.prevZ,v=i.nextZ;for(;w&&w.z>=_&&v&&v.z<=R;){if(w.x>=p&&w.x<=y&&w.y>=g&&w.y<=m&&w!==s&&w!==a&&ar(o,f,l,u,c,d,w.x,w.y)&&Ae(w.prev,w,w.next)>=0||(w=w.prevZ,v.x>=p&&v.x<=y&&v.y>=g&&v.y<=m&&v!==s&&v!==a&&ar(o,f,l,u,c,d,v.x,v.y)&&Ae(v.prev,v,v.next)>=0))return!1;v=v.nextZ}for(;w&&w.z>=_;){if(w.x>=p&&w.x<=y&&w.y>=g&&w.y<=m&&w!==s&&w!==a&&ar(o,f,l,u,c,d,w.x,w.y)&&Ae(w.prev,w,w.next)>=0)return!1;w=w.prevZ}for(;v&&v.z<=R;){if(v.x>=p&&v.x<=y&&v.y>=g&&v.y<=m&&v!==s&&v!==a&&ar(o,f,l,u,c,d,v.x,v.y)&&Ae(v.prev,v,v.next)>=0)return!1;v=v.nextZ}return!0}function Ad(i,t){let e=i;do{let n=e.prev,s=e.next.next;!Ls(n,s)&&Lu(n,e,e.next,s)&&Tr(n,s)&&Tr(s,n)&&(t.push(n.i,e.i,s.i),Er(e),Er(e.next),e=i=s),e=e.next}while(e!==i);return Yi(e)}function Td(i,t,e,n,s,r){let a=i;do{let o=a.next.next;for(;o!==a.prev;){if(a.i!==o.i&&Nd(a,o)){let l=Nu(a,o);a=Yi(a,a.next),l=Yi(l,l.next),Ar(a,t,e,n,s,r,0),Ar(l,t,e,n,s,r,0);return}o=o.next}a=a.next}while(a!==i)}function Ed(i,t,e,n){let s=[];for(let r=0,a=t.length;r<a;r++){let o=t[r]*n,l=r<a-1?t[r+1]*n:i.length,c=Du(i,o,l,n,!1);c===c.next&&(c.steiner=!0),s.push(Ld(c))}s.sort(Cd);for(let r=0;r<s.length;r++)e=Rd(s[r],e);return e}function Cd(i,t){let e=i.x-t.x;if(e===0&&(e=i.y-t.y,e===0)){let n=(i.next.y-i.y)/(i.next.x-i.x),s=(t.next.y-t.y)/(t.next.x-t.x);e=n-s}return e}function Rd(i,t){let e=Pd(i,t);if(!e)return t;let n=Nu(e,i);return Yi(n,n.next),Yi(e,e.next)}function Pd(i,t){let e=t,n=i.x,s=i.y,r=-1/0,a;if(Ls(i,e))return e;do{if(Ls(i,e.next))return e.next;if(s<=e.y&&s>=e.next.y&&e.next.y!==e.y){let u=e.x+(s-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(u<=n&&u>r&&(r=u,a=e.x<e.next.x?e:e.next,u===n))return a}e=e.next}while(e!==t);if(!a)return null;let o=a,l=a.x,c=a.y,f=1/0;e=a;do{if(n>=e.x&&e.x>=l&&n!==e.x&&Uu(s<c?n:r,s,l,c,s<c?r:n,s,e.x,e.y)){let u=Math.abs(s-e.y)/(n-e.x);Tr(e,i)&&(u<f||u===f&&(e.x>a.x||e.x===a.x&&Id(a,e)))&&(a=e,f=u)}e=e.next}while(e!==o);return a}function Id(i,t){return Ae(i.prev,i,t.prev)<0&&Ae(t.next,i,i.next)<0}function Dd(i,t,e,n){let s=i;do s.z===0&&(s.z=Wl(s.x,s.y,t,e,n)),s.prevZ=s.prev,s.nextZ=s.next,s=s.next;while(s!==i);s.prevZ.nextZ=null,s.prevZ=null,Ud(s)}function Ud(i){let t,e=1;do{let n=i,s;i=null;let r=null;for(t=0;n;){t++;let a=n,o=0;for(let c=0;c<e&&(o++,a=a.nextZ,!!a);c++);let l=e;for(;o>0||l>0&&a;)o!==0&&(l===0||!a||n.z<=a.z)?(s=n,n=n.nextZ,o--):(s=a,a=a.nextZ,l--),r?r.nextZ=s:i=s,s.prevZ=r,r=s;n=a}r.nextZ=null,e*=2}while(t>1);return i}function Wl(i,t,e,n,s){return i=(i-e)*s|0,t=(t-n)*s|0,i=(i|i<<8)&16711935,i=(i|i<<4)&252645135,i=(i|i<<2)&858993459,i=(i|i<<1)&1431655765,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,i|t<<1}function Ld(i){let t=i,e=i;do(t.x<e.x||t.x===e.x&&t.y<e.y)&&(e=t),t=t.next;while(t!==i);return e}function Uu(i,t,e,n,s,r,a,o){return(s-a)*(t-o)>=(i-a)*(r-o)&&(i-a)*(n-o)>=(e-a)*(t-o)&&(e-a)*(r-o)>=(s-a)*(n-o)}function ar(i,t,e,n,s,r,a,o){return!(i===a&&t===o)&&Uu(i,t,e,n,s,r,a,o)}function Nd(i,t){return i.next.i!==t.i&&i.prev.i!==t.i&&!Fd(i,t)&&(Tr(i,t)&&Tr(t,i)&&Od(i,t)&&(Ae(i.prev,i,t.prev)||Ae(i,t.prev,t))||Ls(i,t)&&Ae(i.prev,i,i.next)>0&&Ae(t.prev,t,t.next)>0)}function Ae(i,t,e){return(t.y-i.y)*(e.x-t.x)-(t.x-i.x)*(e.y-t.y)}function Ls(i,t){return i.x===t.x&&i.y===t.y}function Lu(i,t,e,n){let s=Ua(Ae(i,t,e)),r=Ua(Ae(i,t,n)),a=Ua(Ae(e,n,i)),o=Ua(Ae(e,n,t));return!!(s!==r&&a!==o||s===0&&Da(i,e,t)||r===0&&Da(i,n,t)||a===0&&Da(e,i,n)||o===0&&Da(e,t,n))}function Da(i,t,e){return t.x<=Math.max(i.x,e.x)&&t.x>=Math.min(i.x,e.x)&&t.y<=Math.max(i.y,e.y)&&t.y>=Math.min(i.y,e.y)}function Ua(i){return i>0?1:i<0?-1:0}function Fd(i,t){let e=i;do{if(e.i!==i.i&&e.next.i!==i.i&&e.i!==t.i&&e.next.i!==t.i&&Lu(e,e.next,i,t))return!0;e=e.next}while(e!==i);return!1}function Tr(i,t){return Ae(i.prev,i,i.next)<0?Ae(i,t,i.next)>=0&&Ae(i,i.prev,t)>=0:Ae(i,t,i.prev)<0||Ae(i,i.next,t)<0}function Od(i,t){let e=i,n=!1,s=(i.x+t.x)/2,r=(i.y+t.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&s<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(n=!n),e=e.next;while(e!==i);return n}function Nu(i,t){let e=Xl(i.i,i.x,i.y),n=Xl(t.i,t.x,t.y),s=i.next,r=t.prev;return i.next=t,t.prev=i,e.next=s,s.prev=e,n.next=e,e.prev=n,r.next=n,n.prev=r,n}function Oh(i,t,e,n){let s=Xl(i,t,e);return n?(s.next=n.next,s.prev=n,n.next.prev=s,n.next=s):(s.prev=s,s.next=s),s}function Er(i){i.next.prev=i.prev,i.prev.next=i.next,i.prevZ&&(i.prevZ.nextZ=i.nextZ),i.nextZ&&(i.nextZ.prevZ=i.prevZ)}function Xl(i,t,e){return{i,x:t,y:e,prev:null,next:null,z:0,prevZ:null,nextZ:null,steiner:!1}}function Bd(i,t,e,n){let s=0;for(let r=t,a=e-n;r<e;r+=n)s+=(i[a]-i[r])*(i[r+1]+i[a+1]),a=r;return s}var ql=class{static triangulate(t,e,n=2){return Md(t,e,n)}},Ns=class i{static area(t){let e=t.length,n=0;for(let s=e-1,r=0;r<e;s=r++)n+=t[s].x*t[r].y-t[r].x*t[s].y;return n*.5}static isClockWise(t){return i.area(t)<0}static triangulateShape(t,e){let n=[],s=[],r=[];Bh(t),kh(n,t);let a=t.length;e.forEach(Bh);for(let l=0;l<e.length;l++)s.push(a),a+=e[l].length,kh(n,e[l]);let o=ql.triangulate(n,s);for(let l=0;l<o.length;l+=3)r.push(o.slice(l,l+3));return r}};function Bh(i){let t=i.length;t>2&&i[t-1].equals(i[0])&&i.pop()}function kh(i,t){for(let e=0;e<t.length;e++)i.push(t[e].x),i.push(t[e].y)}var Cr=class i extends tn{constructor(t=1,e=1,n=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:t,height:e,widthSegments:n,heightSegments:s};let r=t/2,a=e/2,o=Math.floor(n),l=Math.floor(s),c=o+1,f=l+1,u=t/o,d=e/l,p=[],g=[],y=[],m=[];for(let _=0;_<f;_++){let R=_*d-a;for(let w=0;w<c;w++){let v=w*u-r;g.push(v,-R,0),y.push(0,0,1),m.push(w/o),m.push(1-_/l)}}for(let _=0;_<l;_++)for(let R=0;R<o;R++){let w=R+c*_,v=R+c*(_+1),E=R+1+c*(_+1),C=R+1+c*_;p.push(w,v,C),p.push(v,E,C)}this.setIndex(p),this.setAttribute("position",new Ue(g,3)),this.setAttribute("normal",new Ue(y,3)),this.setAttribute("uv",new Ue(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.width,t.height,t.widthSegments,t.heightSegments)}};var Rr=class i extends tn{constructor(t=1,e=32,n=16,s=0,r=Math.PI*2,a=0,o=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:t,widthSegments:e,heightSegments:n,phiStart:s,phiLength:r,thetaStart:a,thetaLength:o},e=Math.max(3,Math.floor(e)),n=Math.max(2,Math.floor(n));let l=Math.min(a+o,Math.PI),c=0,f=[],u=new H,d=new H,p=[],g=[],y=[],m=[];for(let _=0;_<=n;_++){let R=[],w=_/n,v=a+w*o,E=t*Math.cos(v),C=Math.sqrt(t*t-E*E),D=0;_===0&&a===0?D=.5/e:_===n&&l===Math.PI&&(D=-.5/e);for(let S=0;S<=e;S++){let T=S/e,L=s+T*r;u.x=-C*Math.cos(L),u.y=E,u.z=C*Math.sin(L),g.push(u.x,u.y,u.z),d.copy(u).normalize(),y.push(d.x,d.y,d.z),m.push(T+D,1-w),R.push(c++)}f.push(R)}for(let _=0;_<n;_++)for(let R=0;R<e;R++){let w=f[_][R+1],v=f[_][R],E=f[_+1][R],C=f[_+1][R+1];(_!==0||a>0)&&p.push(w,v,C),(_!==n-1||l<Math.PI)&&p.push(v,E,C)}this.setIndex(p),this.setAttribute("position",new Ue(g,3)),this.setAttribute("normal",new Ue(y,3)),this.setAttribute("uv",new Ue(m,2))}copy(t){return super.copy(t),this.parameters=Object.assign({},t.parameters),this}static fromJSON(t){return new i(t.radius,t.widthSegments,t.heightSegments,t.phiStart,t.phiLength,t.thetaStart,t.thetaLength)}};function ts(i){let t={};for(let e in i){t[e]={};for(let n in i[e]){let s=i[e][n];if(zh(s))s.isRenderTargetTexture?(Jt("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),t[e][n]=null):t[e][n]=s.clone();else if(Array.isArray(s))if(zh(s[0])){let r=[];for(let a=0,o=s.length;a<o;a++)r[a]=s[a].clone();t[e][n]=r}else t[e][n]=s.slice();else t[e][n]=s}}return t}function nn(i){let t={};for(let e=0;e<i.length;e++){let n=ts(i[e]);for(let s in n)t[s]=n[s]}return t}function zh(i){return i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)}function kd(i){let t=[];for(let e=0;e<i.length;e++)t.push(i[e].clone());return t}function Sc(i){let t=i.getRenderTarget();return t===null?i.outputColorSpace:t.isXRRenderTarget===!0?t.texture.colorSpace:ce.workingColorSpace}var Fu={clone:ts,merge:nn},zd=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Vd=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,_n=class extends oi{constructor(t){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=zd,this.fragmentShader=Vd,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,t!==void 0&&this.setValues(t)}copy(t){return super.copy(t),this.fragmentShader=t.fragmentShader,this.vertexShader=t.vertexShader,this.uniforms=ts(t.uniforms),this.uniformsGroups=kd(t.uniformsGroups),this.defines=Object.assign({},t.defines),this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.fog=t.fog,this.lights=t.lights,this.clipping=t.clipping,this.extensions=Object.assign({},t.extensions),this.glslVersion=t.glslVersion,this.defaultAttributeValues=Object.assign({},t.defaultAttributeValues),this.index0AttributeName=t.index0AttributeName,this.uniformsNeedUpdate=t.uniformsNeedUpdate,this}toJSON(t){let e=super.toJSON(t);e.glslVersion=this.glslVersion,e.uniforms={};for(let s in this.uniforms){let a=this.uniforms[s].value;a&&a.isTexture?e.uniforms[s]={type:"t",value:a.toJSON(t).uuid}:a&&a.isColor?e.uniforms[s]={type:"c",value:a.getHex()}:a&&a.isVector2?e.uniforms[s]={type:"v2",value:a.toArray()}:a&&a.isVector3?e.uniforms[s]={type:"v3",value:a.toArray()}:a&&a.isVector4?e.uniforms[s]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?e.uniforms[s]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?e.uniforms[s]={type:"m4",value:a.toArray()}:e.uniforms[s]={value:a}}Object.keys(this.defines).length>0&&(e.defines=this.defines),e.vertexShader=this.vertexShader,e.fragmentShader=this.fragmentShader,e.lights=this.lights,e.clipping=this.clipping;let n={};for(let s in this.extensions)this.extensions[s]===!0&&(n[s]=!0);return Object.keys(n).length>0&&(e.extensions=n),e}fromJSON(t,e){if(super.fromJSON(t,e),t.uniforms!==void 0)for(let n in t.uniforms){let s=t.uniforms[n];switch(this.uniforms[n]={},s.type){case"t":this.uniforms[n].value=e[s.value]||null;break;case"c":this.uniforms[n].value=new ie().setHex(s.value);break;case"v2":this.uniforms[n].value=new Kt().fromArray(s.value);break;case"v3":this.uniforms[n].value=new H().fromArray(s.value);break;case"v4":this.uniforms[n].value=new ge().fromArray(s.value);break;case"m3":this.uniforms[n].value=new ne().fromArray(s.value);break;case"m4":this.uniforms[n].value=new se().fromArray(s.value);break;default:this.uniforms[n].value=s.value}}if(t.defines!==void 0&&(this.defines=t.defines),t.vertexShader!==void 0&&(this.vertexShader=t.vertexShader),t.fragmentShader!==void 0&&(this.fragmentShader=t.fragmentShader),t.glslVersion!==void 0&&(this.glslVersion=t.glslVersion),t.extensions!==void 0)for(let n in t.extensions)this.extensions[n]=t.extensions[n];return t.lights!==void 0&&(this.lights=t.lights),t.clipping!==void 0&&(this.clipping=t.clipping),this}},ja=class extends _n{constructor(t){super(t),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}},Zi=class extends oi{constructor(t){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ie(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ie(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Yr,this.normalScale=new Kt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new gn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.defines={STANDARD:""},this.color.copy(t.color),this.roughness=t.roughness,this.metalness=t.metalness,this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.roughnessMap=t.roughnessMap,this.metalnessMap=t.metalnessMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.envMapIntensity=t.envMapIntensity,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}},Ji=class extends Zi{constructor(t){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new Kt(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return ae(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(e){this.ior=(1+.4*e)/(1-.4*e)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new ie(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new ie(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new ie(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(t)}get anisotropy(){return this._anisotropy}set anisotropy(t){this._anisotropy>0!=t>0&&this.version++,this._anisotropy=t}get clearcoat(){return this._clearcoat}set clearcoat(t){this._clearcoat>0!=t>0&&this.version++,this._clearcoat=t}get iridescence(){return this._iridescence}set iridescence(t){this._iridescence>0!=t>0&&this.version++,this._iridescence=t}get dispersion(){return this._dispersion}set dispersion(t){this._dispersion>0!=t>0&&this.version++,this._dispersion=t}get sheen(){return this._sheen}set sheen(t){this._sheen>0!=t>0&&this.version++,this._sheen=t}get transmission(){return this._transmission}set transmission(t){this._transmission>0!=t>0&&this.version++,this._transmission=t}copy(t){return super.copy(t),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=t.anisotropy,this.anisotropyRotation=t.anisotropyRotation,this.anisotropyMap=t.anisotropyMap,this.clearcoat=t.clearcoat,this.clearcoatMap=t.clearcoatMap,this.clearcoatRoughness=t.clearcoatRoughness,this.clearcoatRoughnessMap=t.clearcoatRoughnessMap,this.clearcoatNormalMap=t.clearcoatNormalMap,this.clearcoatNormalScale.copy(t.clearcoatNormalScale),this.dispersion=t.dispersion,this.ior=t.ior,this.iridescence=t.iridescence,this.iridescenceMap=t.iridescenceMap,this.iridescenceIOR=t.iridescenceIOR,this.iridescenceThicknessRange=[...t.iridescenceThicknessRange],this.iridescenceThicknessMap=t.iridescenceThicknessMap,this.sheen=t.sheen,this.sheenColor.copy(t.sheenColor),this.sheenColorMap=t.sheenColorMap,this.sheenRoughness=t.sheenRoughness,this.sheenRoughnessMap=t.sheenRoughnessMap,this.transmission=t.transmission,this.transmissionMap=t.transmissionMap,this.thickness=t.thickness,this.thicknessMap=t.thicknessMap,this.attenuationDistance=t.attenuationDistance,this.attenuationColor.copy(t.attenuationColor),this.specularIntensity=t.specularIntensity,this.specularIntensityMap=t.specularIntensityMap,this.specularColor.copy(t.specularColor),this.specularColorMap=t.specularColorMap,this}};var Pr=class extends oi{constructor(t){super(),this.isMeshLambertMaterial=!0,this.type="MeshLambertMaterial",this.color=new ie(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ie(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Yr,this.normalScale=new Kt(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new gn,this.combine=ho,this.reflectivity=1,this.envMapIntensity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(t)}copy(t){return super.copy(t),this.color.copy(t.color),this.map=t.map,this.lightMap=t.lightMap,this.lightMapIntensity=t.lightMapIntensity,this.aoMap=t.aoMap,this.aoMapIntensity=t.aoMapIntensity,this.emissive.copy(t.emissive),this.emissiveMap=t.emissiveMap,this.emissiveIntensity=t.emissiveIntensity,this.bumpMap=t.bumpMap,this.bumpScale=t.bumpScale,this.normalMap=t.normalMap,this.normalMapType=t.normalMapType,this.normalScale.copy(t.normalScale),this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.specularMap=t.specularMap,this.alphaMap=t.alphaMap,this.envMap=t.envMap,this.envMapRotation.copy(t.envMapRotation),this.combine=t.combine,this.reflectivity=t.reflectivity,this.envMapIntensity=t.envMapIntensity,this.refractionRatio=t.refractionRatio,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this.wireframeLinecap=t.wireframeLinecap,this.wireframeLinejoin=t.wireframeLinejoin,this.flatShading=t.flatShading,this.fog=t.fog,this}},Qa=class extends oi{constructor(t){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=yu,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(t)}copy(t){return super.copy(t),this.depthPacking=t.depthPacking,this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this.wireframe=t.wireframe,this.wireframeLinewidth=t.wireframeLinewidth,this}},to=class extends oi{constructor(t){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(t)}copy(t){return super.copy(t),this.map=t.map,this.alphaMap=t.alphaMap,this.displacementMap=t.displacementMap,this.displacementScale=t.displacementScale,this.displacementBias=t.displacementBias,this}};function La(i,t){return!i||i.constructor===t?i:typeof t.BYTES_PER_ELEMENT=="number"?new t(i):Array.prototype.slice.call(i)}function Gd(i){function t(s,r){return i[s]-i[r]}let e=i.length,n=new Array(e);for(let s=0;s!==e;++s)n[s]=s;return n.sort(t),n}function Vh(i,t,e){let n=i.length,s=new i.constructor(n);for(let r=0,a=0;a!==n;++r){let o=e[r]*t;for(let l=0;l!==t;++l)s[a++]=i[o+l]}return s}function Hd(i,t,e,n){let s=1,r=i[0];for(;r!==void 0&&r[n]===void 0;)r=i[s++];if(r===void 0)return;let a=r[n];if(a!==void 0)if(Array.isArray(a))do a=r[n],a!==void 0&&(t.push(r.time),e.push(...a)),r=i[s++];while(r!==void 0);else if(a.toArray!==void 0)do a=r[n],a!==void 0&&(t.push(r.time),a.toArray(e,e.length)),r=i[s++];while(r!==void 0);else do a=r[n],a!==void 0&&(t.push(r.time),e.push(a)),r=i[s++];while(r!==void 0)}var Ai=class{constructor(t,e,n,s){this.parameterPositions=t,this._cachedIndex=0,this.resultBuffer=s!==void 0?s:new e.constructor(n),this.sampleValues=e,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(t){let e=this.parameterPositions,n=this._cachedIndex,s=e[n],r=e[n-1];n:{t:{let a;e:{i:if(!(t<s)){for(let o=n+2;;){if(s===void 0){if(t<r)break i;return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===o)break;if(r=s,s=e[++n],t<s)break t}a=e.length;break e}if(!(t>=r)){let o=e[1];t<o&&(n=2,r=o);for(let l=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===l)break;if(s=r,r=e[--n-1],t>=r)break t}a=n,n=0;break e}break n}for(;n<a;){let o=n+a>>>1;t<e[o]?a=o:n=o+1}if(s=e[n],r=e[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(s===void 0)return n=e.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,s)}return this.interpolate_(n,r,t,s)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(t){let e=this.resultBuffer,n=this.sampleValues,s=this.valueSize,r=t*s;for(let a=0;a!==s;++a)e[a]=n[r+a];return e}interpolate_(){throw new Error("THREE.Interpolant: Call to abstract method.")}intervalChanged_(){}},eo=class extends Ai{constructor(t,e,n,s){super(t,e,n,s),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:kl,endingEnd:kl}}intervalChanged_(t,e,n){let s=this.parameterPositions,r=t-2,a=t+1,o=s[r],l=s[a];if(o===void 0)switch(this.getSettings_().endingStart){case zl:r=t,o=2*e-n;break;case Vl:r=s.length-2,o=e+s[r]-s[r+1];break;default:r=t,o=n}if(l===void 0)switch(this.getSettings_().endingEnd){case zl:a=t,l=2*n-e;break;case Vl:a=1,l=n+s[1]-s[0];break;default:a=t-1,l=e}let c=(n-e)*.5,f=this.valueSize;this._weightPrev=c/(e-o),this._weightNext=c/(l-n),this._offsetPrev=r*f,this._offsetNext=a*f}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-e)/(s-e),y=g*g,m=y*g,_=-d*m+2*d*y-d*g,R=(1+d)*m+(-1.5-2*d)*y+(-.5+d)*g+1,w=(-1-p)*m+(1.5+p)*y+.5*g,v=p*m-p*y;for(let E=0;E!==o;++E)r[E]=_*a[f+E]+R*a[c+E]+w*a[l+E]+v*a[u+E];return r}},no=class extends Ai{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=(n-e)/(s-e),u=1-f;for(let d=0;d!==o;++d)r[d]=a[c+d]*u+a[l+d]*f;return r}},io=class extends Ai{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t){return this.copySampleValue_(t-1)}},so=class extends Ai{interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=t*o,c=l-o,f=this.inTangents,u=this.outTangents;if(!f||!u){let g=(n-e)/(s-e),y=1-g;for(let m=0;m!==o;++m)r[m]=a[c+m]*y+a[l+m]*g;return r}let d=o*2,p=t-1;for(let g=0;g!==o;++g){let y=a[c+g],m=a[l+g],_=p*d+g*2,R=u[_],w=u[_+1],v=t*d+g*2,E=f[v],C=f[v+1],D=(n-e)/(s-e),S,T,L,N,F;for(let Y=0;Y<8;Y++){S=D*D,T=S*D,L=1-D,N=L*L,F=N*L;let O=F*e+3*N*D*R+3*L*S*E+T*s-n;if(Math.abs(O)<1e-10)break;let K=3*N*(R-e)+6*L*D*(E-R)+3*S*(s-E);if(Math.abs(K)<1e-10)break;D=D-O/K,D=Math.max(0,Math.min(1,D))}r[g]=F*y+3*N*D*w+3*L*S*C+T*m}return r}},on=class{constructor(t,e,n,s){if(t===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(e===void 0||e.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+t);this.name=t,this.times=La(e,this.TimeBufferType),this.values=La(n,this.ValueBufferType),this.setInterpolation(s||this.DefaultInterpolation)}static toJSON(t){let e=t.constructor,n;if(e.toJSON!==this.toJSON)n=e.toJSON(t);else{n={name:t.name,times:La(t.times,Array),values:La(t.values,Array)};let s=t.getInterpolation();s!==t.DefaultInterpolation&&(n.interpolation=s)}return n.type=t.ValueTypeName,n}InterpolantFactoryMethodDiscrete(t){return new io(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodLinear(t){return new no(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodSmooth(t){return new eo(this.times,this.values,this.getValueSize(),t)}InterpolantFactoryMethodBezier(t){let e=new so(this.times,this.values,this.getValueSize(),t);return this.settings&&(e.inTangents=this.settings.inTangents,e.outTangents=this.settings.outTangents),e}setInterpolation(t){let e;switch(t){case cr:e=this.InterpolantFactoryMethodDiscrete;break;case Ya:e=this.InterpolantFactoryMethodLinear;break;case Oa:e=this.InterpolantFactoryMethodSmooth;break;case Bl:e=this.InterpolantFactoryMethodBezier;break}if(e===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(t!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return Jt("KeyframeTrack:",n),this}return this.createInterpolant=e,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return cr;case this.InterpolantFactoryMethodLinear:return Ya;case this.InterpolantFactoryMethodSmooth:return Oa;case this.InterpolantFactoryMethodBezier:return Bl}}getValueSize(){return this.values.length/this.times.length}shift(t){if(t!==0){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]+=t}return this}scale(t){if(t!==1){let e=this.times;for(let n=0,s=e.length;n!==s;++n)e[n]*=t}return this}trim(t,e){let n=this.times,s=n.length,r=0,a=s-1;for(;r!==s&&n[r]<t;)++r;for(;a!==-1&&n[a]>e;)--a;if(++a,r!==0||a!==s){r>=a&&(a=Math.max(a,1),r=a-1);let o=this.getValueSize();this.times=n.slice(r,a),this.values=this.values.slice(r*o,a*o)}return this}validate(){let t=!0,e=this.getValueSize();e-Math.floor(e)!==0&&(jt("KeyframeTrack: Invalid value size in track.",this),t=!1);let n=this.times,s=this.values,r=n.length;r===0&&(jt("KeyframeTrack: Track is empty.",this),t=!1);let a=null;for(let o=0;o!==r;o++){let l=n[o];if(typeof l=="number"&&isNaN(l)){jt("KeyframeTrack: Time is not a valid number.",this,o,l),t=!1;break}if(a!==null&&a>l){jt("KeyframeTrack: Out of order keys.",this,o,l,a),t=!1;break}a=l}if(s!==void 0&&Nf(s))for(let o=0,l=s.length;o!==l;++o){let c=s[o];if(isNaN(c)){jt("KeyframeTrack: Value is not a valid number.",this,o,c),t=!1;break}}return t}optimize(){let t=this.times.slice(),e=this.values.slice(),n=this.getValueSize(),s=this.getInterpolation()===Oa,r=t.length-1,a=1;for(let o=1;o<r;++o){let l=!1,c=t[o],f=t[o+1];if(c!==f&&(o!==1||c!==t[0]))if(s)l=!0;else{let u=o*n,d=u-n,p=u+n;for(let g=0;g!==n;++g){let y=e[u+g];if(y!==e[d+g]||y!==e[p+g]){l=!0;break}}}if(l){if(o!==a){t[a]=t[o];let u=o*n,d=a*n;for(let p=0;p!==n;++p)e[d+p]=e[u+p]}++a}}if(r>0){t[a]=t[r];for(let o=r*n,l=a*n,c=0;c!==n;++c)e[l+c]=e[o+c];++a}return a!==t.length?(this.times=t.slice(0,a),this.values=e.slice(0,a*n)):(this.times=t,this.values=e),this}clone(){let t=this.times.slice(),e=this.values.slice(),n=this.constructor,s=new n(this.name,t,e);return s.createInterpolant=this.createInterpolant,s}};on.prototype.ValueTypeName="";on.prototype.TimeBufferType=Float32Array;on.prototype.ValueBufferType=Float32Array;on.prototype.DefaultInterpolation=Ya;var ci=class extends on{constructor(t,e,n){super(t,e,n)}};ci.prototype.ValueTypeName="bool";ci.prototype.ValueBufferType=Array;ci.prototype.DefaultInterpolation=cr;ci.prototype.InterpolantFactoryMethodLinear=void 0;ci.prototype.InterpolantFactoryMethodSmooth=void 0;var Ir=class extends on{constructor(t,e,n,s){super(t,e,n,s)}};Ir.prototype.ValueTypeName="color";var Fs=class extends on{constructor(t,e,n,s){super(t,e,n,s)}};Fs.prototype.ValueTypeName="number";var ro=class extends Ai{constructor(t,e,n,s){super(t,e,n,s)}interpolate_(t,e,n,s){let r=this.resultBuffer,a=this.sampleValues,o=this.valueSize,l=(n-e)/(s-e),c=t*o;for(let f=c+o;c!==f;c+=4)We.slerpFlat(r,0,a,c-o,a,c,l);return r}},In=class extends on{constructor(t,e,n,s){super(t,e,n,s)}InterpolantFactoryMethodLinear(t){return new ro(this.times,this.values,this.getValueSize(),t)}};In.prototype.ValueTypeName="quaternion";In.prototype.InterpolantFactoryMethodSmooth=void 0;var hi=class extends on{constructor(t,e,n){super(t,e,n)}};hi.prototype.ValueTypeName="string";hi.prototype.ValueBufferType=Array;hi.prototype.DefaultInterpolation=cr;hi.prototype.InterpolantFactoryMethodLinear=void 0;hi.prototype.InterpolantFactoryMethodSmooth=void 0;var wn=class extends on{constructor(t,e,n,s){super(t,e,n,s)}};wn.prototype.ValueTypeName="vector";var Os=class{constructor(t="",e=-1,n=[],s=xu){this.name=t,this.tracks=n,this.duration=e,this.blendMode=s,this.uuid=Ii(),this.userData={},this.duration<0&&this.resetDuration()}static parse(t){let e=[],n=t.tracks,s=1/(t.fps||1);for(let a=0,o=n.length;a!==o;++a)e.push(Xd(n[a]).scale(s));let r=new this(t.name,t.duration,e,t.blendMode);return r.uuid=t.uuid,r.userData=JSON.parse(t.userData||"{}"),r}static toJSON(t){let e=[],n=t.tracks,s={name:t.name,duration:t.duration,tracks:e,uuid:t.uuid,blendMode:t.blendMode,userData:JSON.stringify(t.userData)};for(let r=0,a=n.length;r!==a;++r)e.push(on.toJSON(n[r]));return s}static CreateFromMorphTargetSequence(t,e,n,s){let r=e.length,a=[];for(let o=0;o<r;o++){let l=[],c=[];l.push((o+r-1)%r,o,(o+1)%r),c.push(0,1,0);let f=Gd(l);l=Vh(l,1,f),c=Vh(c,1,f),!s&&l[0]===0&&(l.push(r),c.push(c[0])),a.push(new Fs(".morphTargetInfluences["+e[o].name+"]",l,c).scale(1/n))}return new this(t,-1,a)}static findByName(t,e){let n=t;if(!Array.isArray(t)){let s=t;n=s.geometry&&s.geometry.animations||s.animations}for(let s=0;s<n.length;s++)if(n[s].name===e)return n[s];return null}static CreateClipsFromMorphTargetSequences(t,e,n){let s={},r=/^([\w-]*?)([\d]+)$/;for(let o=0,l=t.length;o<l;o++){let c=t[o],f=c.name.match(r);if(f&&f.length>1){let u=f[1],d=s[u];d||(s[u]=d=[]),d.push(c)}}let a=[];for(let o in s)a.push(this.CreateFromMorphTargetSequence(o,s[o],e,n));return a}resetDuration(){let t=this.tracks,e=0;for(let n=0,s=t.length;n!==s;++n){let r=this.tracks[n];e=Math.max(e,r.times[r.times.length-1])}return this.duration=e,this}trim(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].trim(0,this.duration);return this}validate(){let t=!0;for(let e=0;e<this.tracks.length;e++)t=t&&this.tracks[e].validate();return t}optimize(){for(let t=0;t<this.tracks.length;t++)this.tracks[t].optimize();return this}clone(){let t=[];for(let n=0;n<this.tracks.length;n++)t.push(this.tracks[n].clone());let e=new this.constructor(this.name,this.duration,t,this.blendMode);return e.userData=JSON.parse(JSON.stringify(this.userData)),e}toJSON(){return this.constructor.toJSON(this)}};function Wd(i){switch(i.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return Fs;case"vector":case"vector2":case"vector3":case"vector4":return wn;case"color":return Ir;case"quaternion":return In;case"bool":case"boolean":return ci;case"string":return hi}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+i)}function Xd(i){if(i.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let t=Wd(i.type);if(i.times===void 0){let e=[],n=[];Hd(i.keys,e,n,"value"),i.times=e,i.values=n}return t.parse!==void 0?t.parse(i):new t(i.name,i.times,i.values,i.interpolation)}var Yl={enabled:!1,files:{},add:function(i,t){this.enabled!==!1&&(Gh(i)||(this.files[i]=t))},get:function(i){if(this.enabled!==!1&&!Gh(i))return this.files[i]},remove:function(i){delete this.files[i]},clear:function(){this.files={}}};function Gh(i){try{let t=i.slice(i.indexOf(":")+1);return new URL(t).protocol==="blob:"}catch{return!1}}var ao=class{constructor(t,e,n){let s=this,r=!1,a=0,o=0,l,c=[];this.onStart=void 0,this.onLoad=t,this.onProgress=e,this.onError=n,this._abortController=null,this.itemStart=function(f){o++,r===!1&&s.onStart!==void 0&&s.onStart(f,a,o),r=!0},this.itemEnd=function(f){a++,s.onProgress!==void 0&&s.onProgress(f,a,o),a===o&&(r=!1,s.onLoad!==void 0&&s.onLoad())},this.itemError=function(f){s.onError!==void 0&&s.onError(f)},this.resolveURL=function(f){return f=f.normalize("NFC"),l?l(f):f},this.setURLModifier=function(f){return l=f,this},this.addHandler=function(f,u){return c.push(f,u),this},this.removeHandler=function(f){let u=c.indexOf(f);return u!==-1&&c.splice(u,2),this},this.getHandler=function(f){for(let u=0,d=c.length;u<d;u+=2){let p=c[u],g=c[u+1];if(p.global&&(p.lastIndex=0),p.test(f))return g}return null},this.abort=function(){return this.abortController.abort(),this._abortController=null,this}}get abortController(){return this._abortController||(this._abortController=new AbortController),this._abortController}},Ou=new ao,Ti=class{constructor(t){this.manager=t!==void 0?t:Ou,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}load(){}loadAsync(t,e){let n=this;return new Promise(function(s,r){n.load(t,s,e,r)})}parse(){}setCrossOrigin(t){return this.crossOrigin=t,this}setWithCredentials(t){return this.withCredentials=t,this}setPath(t){return this.path=t,this}setResourcePath(t){return this.resourcePath=t,this}setRequestHeader(t){return this.requestHeader=t,this}abort(){return this}};Ti.DEFAULT_MATERIAL_NAME="__DEFAULT";var ii={},Zl=class extends Error{constructor(t,e){super(t),this.response=e}},Bs=class extends Ti{constructor(t){super(t),this.mimeType="",this.responseType="",this._abortController=new AbortController}load(t,e,n,s){t===void 0&&(t=""),this.path!==void 0&&(t=this.path+t),t=this.manager.resolveURL(t);let r=Yl.get(`file:${t}`);if(r!==void 0){this.manager.itemStart(t),setTimeout(()=>{e&&e(r),this.manager.itemEnd(t)},0);return}if(ii[t]!==void 0){ii[t].push({onLoad:e,onProgress:n,onError:s});return}ii[t]=[],ii[t].push({onLoad:e,onProgress:n,onError:s});let a=new Request(t,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin",signal:typeof AbortSignal.any=="function"?AbortSignal.any([this._abortController.signal,this.manager.abortController.signal]):this._abortController.signal}),o=this.mimeType,l=this.responseType;fetch(a).then(c=>{if(c.status===200||c.status===0){if(c.status===0&&Jt("FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||c.body===void 0||c.body.getReader===void 0)return c;let f=ii[t],u=c.body.getReader(),d=c.headers.get("X-File-Size")||c.headers.get("Content-Length"),p=d?parseInt(d):0,g=p!==0,y=0,m=new ReadableStream({start(_){R();function R(){u.read().then(({done:w,value:v})=>{if(w)_.close();else{y+=v.byteLength;let E=new ProgressEvent("progress",{lengthComputable:g,loaded:y,total:p});for(let C=0,D=f.length;C<D;C++){let S=f[C];S.onProgress&&S.onProgress(E)}_.enqueue(v),R()}},w=>{_.error(w)})}}});return new Response(m)}else throw new Zl(`fetch for "${c.url}" responded with ${c.status}: ${c.statusText}`,c)}).then(c=>{switch(l){case"arraybuffer":return c.arrayBuffer();case"blob":return c.blob();case"document":return c.text().then(f=>new DOMParser().parseFromString(f,o));case"json":return c.json();default:if(o==="")return c.text();{let u=/charset="?([^;"\s]*)"?/i.exec(o),d=u&&u[1]?u[1].toLowerCase():void 0,p=new TextDecoder(d);return c.arrayBuffer().then(g=>p.decode(g))}}}).then(c=>{Yl.add(`file:${t}`,c);let f=ii[t];delete ii[t];for(let u=0,d=f.length;u<d;u++){let p=f[u];p.onLoad&&p.onLoad(c)}}).catch(c=>{let f=ii[t];if(f===void 0)throw this.manager.itemError(t),c;delete ii[t];for(let u=0,d=f.length;u<d;u++){let p=f[u];p.onError&&p.onError(c)}this.manager.itemError(t)}).finally(()=>{this.manager.itemEnd(t)}),this.manager.itemStart(t)}setResponseType(t){return this.responseType=t,this}setMimeType(t){return this.mimeType=t,this}abort(){return this._abortController.abort(),this._abortController=new AbortController,this}};var Dr=class extends Ti{constructor(t){super(t)}load(t,e,n,s){let r=this,a=new wi,o=new Bs(this.manager);return o.setResponseType("arraybuffer"),o.setRequestHeader(this.requestHeader),o.setPath(this.path),o.setWithCredentials(r.withCredentials),o.load(t,function(l){let c;try{c=r.parse(l)}catch(f){s!==void 0?s(f):jt(f);return}r._applyTexData(a,c),e&&e(a,c)},n,s),a}createDataTexture(t){let e=new wi;return this._applyTexData(e,this.parse(t)),e}_applyTexData(t,e){e.image!==void 0?t.image=e.image:e.data!==void 0&&(t.image.width=e.width,t.image.height=e.height,t.image.data=e.data),t.wrapS=e.wrapS!==void 0?e.wrapS:an,t.wrapT=e.wrapT!==void 0?e.wrapT:an,t.magFilter=e.magFilter!==void 0?e.magFilter:Te,t.minFilter=e.minFilter!==void 0?e.minFilter:Te,t.anisotropy=e.anisotropy!==void 0?e.anisotropy:1,e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.mipmaps!==void 0&&(t.mipmaps=e.mipmaps,t.minFilter=fi),e.mipmapCount===1&&(t.minFilter=Te),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),t.needsUpdate=!0}};var Ki=class extends we{constructor(t,e=1){super(),this.isLight=!0,this.type="Light",this.color=new ie(t),this.intensity=e}dispose(){this.dispatchEvent({type:"dispose"})}copy(t,e){return super.copy(t,e),this.color.copy(t.color),this.intensity=t.intensity,this}toJSON(t){let e=super.toJSON(t);return e.object.color=this.color.getHex(),e.object.intensity=this.intensity,e}};var Fl=new se,Hh=new H,Wh=new H,Ur=class{constructor(t){this.camera=t,this.intensity=1,this.bias=0,this.biasNode=null,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new Kt(512,512),this.mapType=ln,this.map=null,this.mapPass=null,this.matrix=new se,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Ds,this._frameExtents=new Kt(1,1),this._viewportCount=1,this._viewports=[new ge(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(t){let e=this.camera,n=this.matrix;Hh.setFromMatrixPosition(t.matrixWorld),e.position.copy(Hh),Wh.setFromMatrixPosition(t.target.matrixWorld),e.lookAt(Wh),e.updateMatrixWorld(),Fl.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Fl,e.coordinateSystem,e.reversedDepth),e.coordinateSystem===Ts||e.reversedDepth?n.set(.5,0,0,.5,0,.5,0,.5,0,0,1,0,0,0,0,1):n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(Fl)}getViewport(t){return this._viewports[t]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(t){return this.camera=t.camera.clone(),this.intensity=t.intensity,this.bias=t.bias,this.radius=t.radius,this.autoUpdate=t.autoUpdate,this.needsUpdate=t.needsUpdate,this.normalBias=t.normalBias,this.blurSamples=t.blurSamples,this.mapSize.copy(t.mapSize),this.biasNode=t.biasNode,this}clone(){return new this.constructor().copy(this)}toJSON(){let t={};return this.intensity!==1&&(t.intensity=this.intensity),this.bias!==0&&(t.bias=this.bias),this.normalBias!==0&&(t.normalBias=this.normalBias),this.radius!==1&&(t.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(t.mapSize=this.mapSize.toArray()),t.camera=this.camera.toJSON(!1).object,delete t.camera.matrix,t}},Na=new H,Fa=new We,kn=new H,Lr=class extends we{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new se,this.projectionMatrix=new se,this.projectionMatrixInverse=new se,this.coordinateSystem=Cn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(t,e){return super.copy(t,e),this.matrixWorldInverse.copy(t.matrixWorldInverse),this.projectionMatrix.copy(t.projectionMatrix),this.projectionMatrixInverse.copy(t.projectionMatrixInverse),this.coordinateSystem=t.coordinateSystem,this}getWorldDirection(t){return super.getWorldDirection(t).negate()}updateMatrixWorld(t){super.updateMatrixWorld(t),this.matrixWorld.decompose(Na,Fa,kn),kn.x===1&&kn.y===1&&kn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Na,Fa,kn.set(1,1,1)).invert()}updateWorldMatrix(t,e,n=!1){super.updateWorldMatrix(t,e,n),this.matrixWorld.decompose(Na,Fa,kn),kn.x===1&&kn.y===1&&kn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Na,Fa,kn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}},Si=new H,Xh=new Kt,qh=new Kt,Ge=class extends Lr{constructor(t=50,e=1,n=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=t,this.zoom=1,this.near=n,this.far=s,this.focus=10,this.aspect=e,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.fov=t.fov,this.zoom=t.zoom,this.near=t.near,this.far=t.far,this.focus=t.focus,this.aspect=t.aspect,this.view=t.view===null?null:Object.assign({},t.view),this.filmGauge=t.filmGauge,this.filmOffset=t.filmOffset,this}setFocalLength(t){let e=.5*this.getFilmHeight()/t;this.fov=Xi*2*Math.atan(e),this.updateProjectionMatrix()}getFocalLength(){let t=Math.tan(or*.5*this.fov);return .5*this.getFilmHeight()/t}getEffectiveFOV(){return Xi*2*Math.atan(Math.tan(or*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(t,e,n){Si.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),e.set(Si.x,Si.y).multiplyScalar(-t/Si.z),Si.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Si.x,Si.y).multiplyScalar(-t/Si.z)}getViewSize(t,e){return this.getViewBounds(t,Xh,qh),e.subVectors(qh,Xh)}setViewOffset(t,e,n,s,r,a){this.aspect=t/e,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=this.near,e=t*Math.tan(or*.5*this.fov)/this.zoom,n=2*e,s=this.aspect*n,r=-.5*s,a=this.view;if(this.view!==null&&this.view.enabled){let l=a.fullWidth,c=a.fullHeight;r+=a.offsetX*s/l,e-=a.offsetY*n/c,s*=a.width/l,n*=a.height/c}let o=this.filmOffset;o!==0&&(r+=t*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,e,e-n,t,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.fov=this.fov,e.object.zoom=this.zoom,e.object.near=this.near,e.object.far=this.far,e.object.focus=this.focus,e.object.aspect=this.aspect,this.view!==null&&(e.object.view=Object.assign({},this.view)),e.object.filmGauge=this.filmGauge,e.object.filmOffset=this.filmOffset,e}},Jl=class extends Ur{constructor(){super(new Ge(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1,this.aspect=1}updateMatrices(t){let e=this.camera,n=Xi*2*t.angle*this.focus,s=this.mapSize.width/this.mapSize.height*this.aspect,r=t.distance||e.far;(n!==e.fov||s!==e.aspect||r!==e.far)&&(e.fov=n,e.aspect=s,e.far=r,e.updateProjectionMatrix()),super.updateMatrices(t)}copy(t){return super.copy(t),this.focus=t.focus,this}},Nr=class extends Ki{constructor(t,e,n=0,s=Math.PI/3,r=0,a=2){super(t,e),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(we.DEFAULT_UP),this.updateMatrix(),this.target=new we,this.distance=n,this.angle=s,this.penumbra=r,this.decay=a,this.map=null,this.shadow=new Jl}get power(){return this.intensity*Math.PI}set power(t){this.intensity=t/Math.PI}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.angle=t.angle,this.penumbra=t.penumbra,this.decay=t.decay,this.target=t.target.clone(),this.map=t.map,this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.distance=this.distance,e.object.angle=this.angle,e.object.decay=this.decay,e.object.penumbra=this.penumbra,e.object.target=this.target.uuid,this.map&&this.map.isTexture&&(e.object.map=this.map.toJSON(t).uuid),e.object.shadow=this.shadow.toJSON(),e}},Kl=class extends Ur{constructor(){super(new Ge(90,1,.5,500)),this.isPointLightShadow=!0}},$i=class extends Ki{constructor(t,e,n=0,s=2){super(t,e),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=s,this.shadow=new Kl}get power(){return this.intensity*4*Math.PI}set power(t){this.intensity=t/(4*Math.PI)}dispose(){super.dispose(),this.shadow.dispose()}copy(t,e){return super.copy(t,e),this.distance=t.distance,this.decay=t.decay,this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.distance=this.distance,e.object.decay=this.decay,e.object.shadow=this.shadow.toJSON(),e}},ui=class extends Lr{constructor(t=-1,e=1,n=1,s=-1,r=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=t,this.right=e,this.top=n,this.bottom=s,this.near=r,this.far=a,this.updateProjectionMatrix()}copy(t,e){return super.copy(t,e),this.left=t.left,this.right=t.right,this.top=t.top,this.bottom=t.bottom,this.near=t.near,this.far=t.far,this.zoom=t.zoom,this.view=t.view===null?null:Object.assign({},t.view),this}setViewOffset(t,e,n,s,r,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=t,this.view.fullHeight=e,this.view.offsetX=n,this.view.offsetY=s,this.view.width=r,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let t=(this.right-this.left)/(2*this.zoom),e=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,s=(this.top+this.bottom)/2,r=n-t,a=n+t,o=s+e,l=s-e;if(this.view!==null&&this.view.enabled){let c=(this.right-this.left)/this.view.fullWidth/this.zoom,f=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=c*this.view.offsetX,a=r+c*this.view.width,o-=f*this.view.offsetY,l=o-f*this.view.height}this.projectionMatrix.makeOrthographic(r,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(t){let e=super.toJSON(t);return e.object.zoom=this.zoom,e.object.left=this.left,e.object.right=this.right,e.object.top=this.top,e.object.bottom=this.bottom,e.object.near=this.near,e.object.far=this.far,this.view!==null&&(e.object.view=Object.assign({},this.view)),e}},$l=class extends Ur{constructor(){super(new ui(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},Fr=class extends Ki{constructor(t,e){super(t,e),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(we.DEFAULT_UP),this.updateMatrix(),this.target=new we,this.shadow=new $l}dispose(){super.dispose(),this.shadow.dispose()}copy(t){return super.copy(t),this.target=t.target.clone(),this.shadow=t.shadow.clone(),this}toJSON(t){let e=super.toJSON(t);return e.object.shadow=this.shadow.toJSON(),e.object.target=this.target.uuid,e}};var ks=class extends Ki{constructor(t,e,n=10,s=10){super(t,e),this.isRectAreaLight=!0,this.type="RectAreaLight",this.width=n,this.height=s}get power(){return this.intensity*this.width*this.height*Math.PI}set power(t){this.intensity=t/(this.width*this.height*Math.PI)}copy(t){return super.copy(t),this.width=t.width,this.height=t.height,this}toJSON(t){let e=super.toJSON(t);return e.object.width=this.width,e.object.height=this.height,e}};var ji=class{static extractUrlBase(t){let e=t.lastIndexOf("/");return e===-1?"./":t.slice(0,e+1)}static resolveURL(t,e){return typeof t!="string"||t===""?"":(/^https?:\/\//i.test(e)&&/^\//.test(t)&&(e=e.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(t)||/^data:.*,.*$/i.test(t)||/^blob:.*$/i.test(t)?t:e+t)}};var Ss=-90,Ms=1,oo=class extends we{constructor(t,e,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let s=new Ge(Ss,Ms,t,e);s.layers=this.layers,this.add(s);let r=new Ge(Ss,Ms,t,e);r.layers=this.layers,this.add(r);let a=new Ge(Ss,Ms,t,e);a.layers=this.layers,this.add(a);let o=new Ge(Ss,Ms,t,e);o.layers=this.layers,this.add(o);let l=new Ge(Ss,Ms,t,e);l.layers=this.layers,this.add(l);let c=new Ge(Ss,Ms,t,e);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){let t=this.coordinateSystem,e=this.children.concat(),[n,s,r,a,o,l]=e;for(let c of e)this.remove(c);if(t===Cn)n.up.set(0,1,0),n.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(t===Ts)n.up.set(0,-1,0),n.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+t);for(let c of e)this.add(c),c.updateMatrixWorld()}update(t,e){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:s}=this;this.coordinateSystem!==t.coordinateSystem&&(this.coordinateSystem=t.coordinateSystem,this.updateCoordinateSystem());let[r,a,o,l,c,f]=this.children,u=t.getRenderTarget(),d=t.getActiveCubeFace(),p=t.getActiveMipmapLevel(),g=t.xr.enabled;t.xr.enabled=!1;let y=n.texture.generateMipmaps;n.texture.generateMipmaps=!1;let m=!1;t.isWebGLRenderer===!0?m=t.state.buffers.depth.getReversed():m=t.reversedDepthBuffer,t.setRenderTarget(n,0,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,r),t.setRenderTarget(n,1,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,a),t.setRenderTarget(n,2,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,o),t.setRenderTarget(n,3,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,l),t.setRenderTarget(n,4,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,c),n.texture.generateMipmaps=y,t.setRenderTarget(n,5,s),m&&t.autoClear===!1&&t.clearDepth(),t.render(e,f),t.setRenderTarget(u,d,p),t.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},lo=class extends Ge{constructor(t=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=t}};var Mc="\\[\\]\\.:\\/",qd=new RegExp("["+Mc+"]","g"),bc="[^"+Mc+"]",Yd="[^"+Mc.replace("\\.","")+"]",Zd=/((?:WC+[\/:])*)/.source.replace("WC",bc),Jd=/(WCOD+)?/.source.replace("WCOD",Yd),Kd=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",bc),$d=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",bc),jd=new RegExp("^"+Zd+Jd+Kd+$d+"$"),Qd=["material","materials","bones","map"],jl=class{constructor(t,e,n){let s=n||Me.parseTrackName(e);this._targetGroup=t,this._bindings=t.subscribe_(e,s)}getValue(t,e){this.bind();let n=this._targetGroup.nCachedObjects_,s=this._bindings[n];s!==void 0&&s.getValue(t,e)}setValue(t,e){let n=this._bindings;for(let s=this._targetGroup.nCachedObjects_,r=n.length;s!==r;++s)n[s].setValue(t,e)}bind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].bind()}unbind(){let t=this._bindings;for(let e=this._targetGroup.nCachedObjects_,n=t.length;e!==n;++e)t[e].unbind()}},Me=class i{constructor(t,e,n){this.path=e,this.parsedPath=n||i.parseTrackName(e),this.node=i.findNode(t,this.parsedPath.nodeName),this.rootNode=t,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(t,e,n){return t&&t.isAnimationObjectGroup?new i.Composite(t,e,n):new i(t,e,n)}static sanitizeNodeName(t){return t.replace(/\s/g,"_").replace(qd,"")}static parseTrackName(t){let e=jd.exec(t);if(e===null)throw new Error("THREE.PropertyBinding: Cannot parse trackName: "+t);let n={nodeName:e[2],objectName:e[3],objectIndex:e[4],propertyName:e[5],propertyIndex:e[6]},s=n.nodeName&&n.nodeName.lastIndexOf(".");if(s!==void 0&&s!==-1){let r=n.nodeName.substring(s+1);Qd.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,s),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("THREE.PropertyBinding: can not parse propertyName from trackName: "+t);return n}static findNode(t,e){if(e===void 0||e===""||e==="."||e===-1||e===t.name||e===t.uuid)return t;if(t.skeleton){let n=t.skeleton.getBoneByName(e);if(n!==void 0)return n}if(t.children){let n=function(r){for(let a=0;a<r.length;a++){let o=r[a];if(o.name===e||o.uuid===e)return o;let l=n(o.children);if(l)return l}return null},s=n(t.children);if(s)return s}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(t,e){t[e]=this.targetObject[this.propertyName]}_getValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)t[e++]=n[s]}_getValue_arrayElement(t,e){t[e]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(t,e){this.resolvedProperty.toArray(t,e)}_setValue_direct(t,e){this.targetObject[this.propertyName]=t[e]}_setValue_direct_setNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(t,e){this.targetObject[this.propertyName]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++]}_setValue_array_setNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(t,e){let n=this.resolvedProperty;for(let s=0,r=n.length;s!==r;++s)n[s]=t[e++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(t,e){this.resolvedProperty[this.propertyIndex]=t[e]}_setValue_arrayElement_setNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty[this.propertyIndex]=t[e],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(t,e){this.resolvedProperty.fromArray(t,e)}_setValue_fromArray_setNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(t,e){this.resolvedProperty.fromArray(t,e),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(t,e){this.bind(),this.getValue(t,e)}_setValue_unbound(t,e){this.bind(),this.setValue(t,e)}bind(){let t=this.node,e=this.parsedPath,n=e.objectName,s=e.propertyName,r=e.propertyIndex;if(t||(t=i.findNode(this.rootNode,e.nodeName),this.node=t),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!t){Jt("PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let c=e.objectIndex;switch(n){case"materials":if(!t.material){jt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.materials){jt("PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}t=t.material.materials;break;case"bones":if(!t.skeleton){jt("PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}t=t.skeleton.bones;for(let f=0;f<t.length;f++)if(t[f].name===c){c=f;break}break;case"map":if("map"in t){t=t.map;break}if(!t.material){jt("PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!t.material.map){jt("PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}t=t.material.map;break;default:if(t[n]===void 0){jt("PropertyBinding: Can not bind to objectName of node undefined.",this);return}t=t[n]}if(c!==void 0){if(t[c]===void 0){jt("PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,t);return}t=t[c]}}let a=t[s];if(a===void 0){let c=e.nodeName;jt("PropertyBinding: Trying to update property for track: "+c+"."+s+" but it wasn't found.",t);return}let o=this.Versioning.None;this.targetObject=t,t.isMaterial===!0?o=this.Versioning.NeedsUpdate:t.isObject3D===!0&&(o=this.Versioning.MatrixWorldNeedsUpdate);let l=this.BindingType.Direct;if(r!==void 0){if(s==="morphTargetInfluences"){if(!t.geometry){jt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!t.geometry.morphAttributes){jt("PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}t.morphTargetDictionary[r]!==void 0&&(r=t.morphTargetDictionary[r])}l=this.BindingType.ArrayElement,this.resolvedProperty=a,this.propertyIndex=r}else a.fromArray!==void 0&&a.toArray!==void 0?(l=this.BindingType.HasFromToArray,this.resolvedProperty=a):Array.isArray(a)?(l=this.BindingType.EntireArray,this.resolvedProperty=a):this.propertyName=s;this.getValue=this.GetterByBindingType[l],this.setValue=this.SetterByBindingTypeAndVersioning[l][o]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};Me.Composite=jl;Me.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};Me.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};Me.prototype.GetterByBindingType=[Me.prototype._getValue_direct,Me.prototype._getValue_array,Me.prototype._getValue_arrayElement,Me.prototype._getValue_toArray];Me.prototype.SetterByBindingTypeAndVersioning=[[Me.prototype._setValue_direct,Me.prototype._setValue_direct_setNeedsUpdate,Me.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[Me.prototype._setValue_array,Me.prototype._setValue_array_setNeedsUpdate,Me.prototype._setValue_array_setMatrixWorldNeedsUpdate],[Me.prototype._setValue_arrayElement,Me.prototype._setValue_arrayElement_setNeedsUpdate,Me.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[Me.prototype._setValue_fromArray,Me.prototype._setValue_fromArray_setNeedsUpdate,Me.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Ux=new Float32Array(1);var zs=class{constructor(t=1,e=0,n=0){this.radius=t,this.phi=e,this.theta=n}set(t,e,n){return this.radius=t,this.phi=e,this.theta=n,this}copy(t){return this.radius=t.radius,this.phi=t.phi,this.theta=t.theta,this}makeSafe(){return this.phi=ae(this.phi,1e-6,Math.PI-1e-6),this}setFromVector3(t){return this.setFromCartesianCoords(t.x,t.y,t.z)}setFromCartesianCoords(t,e,n){return this.radius=Math.sqrt(t*t+e*e+n*n),this.radius===0?(this.theta=0,this.phi=0):(this.theta=Math.atan2(t,n),this.phi=Math.acos(ae(e/this.radius,-1,1))),this}clone(){return new this.constructor().copy(this)}};var Rc=class Rc{constructor(t,e,n,s){this.elements=[1,0,0,1],t!==void 0&&this.set(t,e,n,s)}identity(){return this.set(1,0,0,1),this}fromArray(t,e=0){for(let n=0;n<4;n++)this.elements[n]=t[n+e];return this}set(t,e,n,s){let r=this.elements;return r[0]=t,r[2]=e,r[1]=n,r[3]=s,this}};Rc.prototype.isMatrix2=!0;var Ql=Rc;var Or=class extends Rn{constructor(t,e=null){super(),this.object=t,this.domElement=e,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(t){if(t===void 0){Jt("Controls: connect() now requires an element.");return}this.domElement!==null&&this.disconnect(),this.domElement=t}disconnect(){}dispose(){}update(){}};function wc(i,t,e,n){let s=tp(n);switch(e){case mc:return i*t;case di:return i*t/s.components*s.byteLength;case yo:return i*t/s.components*s.byteLength;case cn:return i*t*2/s.components*s.byteLength;case vo:return i*t*2/s.components*s.byteLength;case gc:return i*t*3/s.components*s.byteLength;case Le:return i*t*4/s.components*s.byteLength;case So:return i*t*4/s.components*s.byteLength;case Vr:case Gr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Hr:case Wr:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case bo:case Ao:return Math.max(i,16)*Math.max(t,8)/4;case Mo:case wo:return Math.max(i,8)*Math.max(t,8)/2;case To:case Eo:case Ro:case Po:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*8;case Co:case Xr:case Io:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Do:return Math.floor((i+3)/4)*Math.floor((t+3)/4)*16;case Uo:return Math.floor((i+4)/5)*Math.floor((t+3)/4)*16;case Lo:return Math.floor((i+4)/5)*Math.floor((t+4)/5)*16;case No:return Math.floor((i+5)/6)*Math.floor((t+4)/5)*16;case Fo:return Math.floor((i+5)/6)*Math.floor((t+5)/6)*16;case Oo:return Math.floor((i+7)/8)*Math.floor((t+4)/5)*16;case Bo:return Math.floor((i+7)/8)*Math.floor((t+5)/6)*16;case ko:return Math.floor((i+7)/8)*Math.floor((t+7)/8)*16;case zo:return Math.floor((i+9)/10)*Math.floor((t+4)/5)*16;case Vo:return Math.floor((i+9)/10)*Math.floor((t+5)/6)*16;case Go:return Math.floor((i+9)/10)*Math.floor((t+7)/8)*16;case Ho:return Math.floor((i+9)/10)*Math.floor((t+9)/10)*16;case Wo:return Math.floor((i+11)/12)*Math.floor((t+9)/10)*16;case Xo:return Math.floor((i+11)/12)*Math.floor((t+11)/12)*16;case qo:case Yo:case Zo:return Math.ceil(i/4)*Math.ceil(t/4)*16;case Jo:case Ko:return Math.ceil(i/4)*Math.ceil(t/4)*8;case qr:case $o:return Math.ceil(i/4)*Math.ceil(t/4)*16}throw new Error(`Unable to determine texture byte length for ${e} format.`)}function tp(i){switch(i){case ln:case uc:return{byteLength:1,components:1};case Gs:case fc:case en:return{byteLength:2,components:1};case _o:case xo:return{byteLength:2,components:4};case Un:case go:case qe:return{byteLength:4,components:1};case dc:case pc:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${i}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"185"}}));typeof window<"u"&&(window.__THREE__?Jt("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="185");function of(){let i=null,t=!1,e=null,n=null;function s(r,a){e(r,a),n=i.requestAnimationFrame(s)}return{start:function(){t!==!0&&e!==null&&i!==null&&(n=i.requestAnimationFrame(s),t=!0)},stop:function(){i!==null&&i.cancelAnimationFrame(n),t=!1},setAnimationLoop:function(r){e=r},setContext:function(r){i=r}}}function np(i){let t=new WeakMap;function e(o,l){let c=o.array,f=o.usage,u=c.byteLength,d=i.createBuffer();i.bindBuffer(l,d),i.bufferData(l,c,f),o.onUploadCallback();let p;if(c instanceof Float32Array)p=i.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)p=i.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?p=i.HALF_FLOAT:p=i.UNSIGNED_SHORT;else if(c instanceof Int16Array)p=i.SHORT;else if(c instanceof Uint32Array)p=i.UNSIGNED_INT;else if(c instanceof Int32Array)p=i.INT;else if(c instanceof Int8Array)p=i.BYTE;else if(c instanceof Uint8Array)p=i.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)p=i.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:d,type:p,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:u}}function n(o,l,c){let f=l.array,u=l.updateRanges;if(i.bindBuffer(c,o),u.length===0)i.bufferSubData(c,0,f);else{u.sort((p,g)=>p.start-g.start);let d=0;for(let p=1;p<u.length;p++){let g=u[d],y=u[p];y.start<=g.start+g.count+1?g.count=Math.max(g.count,y.start+y.count-g.start):(++d,u[d]=y)}u.length=d+1;for(let p=0,g=u.length;p<g;p++){let y=u[p];i.bufferSubData(c,y.start*f.BYTES_PER_ELEMENT,f,y.start,y.count)}l.clearUpdateRanges()}l.onUploadCallback()}function s(o){return o.isInterleavedBufferAttribute&&(o=o.data),t.get(o)}function r(o){o.isInterleavedBufferAttribute&&(o=o.data);let l=t.get(o);l&&(i.deleteBuffer(l.buffer),t.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){let f=t.get(o);(!f||f.version<o.version)&&t.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}let c=t.get(o);if(c===void 0)t.set(o,e(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(c.buffer,o,l),c.version=o.version}}return{get:s,remove:r,update:a}}var ip=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,sp=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,rp=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,ap=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,op=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,lp=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,cp=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,hp=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,up=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,fp=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,dp=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,pp=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,mp=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,gp=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,_p=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,xp=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,yp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,vp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Sp=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Mp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,bp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,wp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,Ap=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,Tp=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Ep=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Cp=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Rp=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Pp=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Ip=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,Dp=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Up="gl_FragColor = linearToOutputTexel( gl_FragColor );",Lp=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Np=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Fp=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Op=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Bp=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,kp=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,zp=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Vp=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Gp=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Hp=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Wp=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Xp=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,qp=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Yp=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Zp=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,Jp=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,Kp=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,$p=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,jp=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Qp=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,tm=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,em=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,nm=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,im=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,sm=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,rm=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,am=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,om=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,lm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,cm=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,hm=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,um=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,fm=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,dm=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,pm=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,mm=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,gm=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,_m=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,xm=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,ym=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,vm=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Sm=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Mm=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,bm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,wm=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Am=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,Tm=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Em=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Cm=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Rm=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Pm=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Im=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,Dm=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Um=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Lm=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,Nm=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,Fm=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,Om=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,Bm=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,km=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,zm=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,Vm=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,Gm=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,Hm=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,Wm=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Xm=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,qm=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Ym=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,Zm=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Jm=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,Km=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,$m=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,jm=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,Qm=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,tg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,eg=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,ng=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,ig=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,sg=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,rg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,ag=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,og=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,lg=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,cg=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,hg=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,ug=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,fg=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,dg=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,pg=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,mg=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,gg=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,_g=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,xg=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,yg=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,vg=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Sg=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Mg=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,bg=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,wg=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Ag=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Tg=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Eg=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Cg=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Rg=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Pg=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ig=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,Dg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Ug=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Lg=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Ng=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Fg=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,oe={alphahash_fragment:ip,alphahash_pars_fragment:sp,alphamap_fragment:rp,alphamap_pars_fragment:ap,alphatest_fragment:op,alphatest_pars_fragment:lp,aomap_fragment:cp,aomap_pars_fragment:hp,batching_pars_vertex:up,batching_vertex:fp,begin_vertex:dp,beginnormal_vertex:pp,bsdfs:mp,iridescence_fragment:gp,bumpmap_pars_fragment:_p,clipping_planes_fragment:xp,clipping_planes_pars_fragment:yp,clipping_planes_pars_vertex:vp,clipping_planes_vertex:Sp,color_fragment:Mp,color_pars_fragment:bp,color_pars_vertex:wp,color_vertex:Ap,common:Tp,cube_uv_reflection_fragment:Ep,defaultnormal_vertex:Cp,displacementmap_pars_vertex:Rp,displacementmap_vertex:Pp,emissivemap_fragment:Ip,emissivemap_pars_fragment:Dp,colorspace_fragment:Up,colorspace_pars_fragment:Lp,envmap_fragment:Np,envmap_common_pars_fragment:Fp,envmap_pars_fragment:Op,envmap_pars_vertex:Bp,envmap_physical_pars_fragment:Jp,envmap_vertex:kp,fog_vertex:zp,fog_pars_vertex:Vp,fog_fragment:Gp,fog_pars_fragment:Hp,gradientmap_pars_fragment:Wp,lightmap_pars_fragment:Xp,lights_lambert_fragment:qp,lights_lambert_pars_fragment:Yp,lights_pars_begin:Zp,lights_toon_fragment:Kp,lights_toon_pars_fragment:$p,lights_phong_fragment:jp,lights_phong_pars_fragment:Qp,lights_physical_fragment:tm,lights_physical_pars_fragment:em,lights_fragment_begin:nm,lights_fragment_maps:im,lights_fragment_end:sm,lightprobes_pars_fragment:rm,logdepthbuf_fragment:am,logdepthbuf_pars_fragment:om,logdepthbuf_pars_vertex:lm,logdepthbuf_vertex:cm,map_fragment:hm,map_pars_fragment:um,map_particle_fragment:fm,map_particle_pars_fragment:dm,metalnessmap_fragment:pm,metalnessmap_pars_fragment:mm,morphinstance_vertex:gm,morphcolor_vertex:_m,morphnormal_vertex:xm,morphtarget_pars_vertex:ym,morphtarget_vertex:vm,normal_fragment_begin:Sm,normal_fragment_maps:Mm,normal_pars_fragment:bm,normal_pars_vertex:wm,normal_vertex:Am,normalmap_pars_fragment:Tm,clearcoat_normal_fragment_begin:Em,clearcoat_normal_fragment_maps:Cm,clearcoat_pars_fragment:Rm,iridescence_pars_fragment:Pm,opaque_fragment:Im,packing:Dm,premultiplied_alpha_fragment:Um,project_vertex:Lm,dithering_fragment:Nm,dithering_pars_fragment:Fm,roughnessmap_fragment:Om,roughnessmap_pars_fragment:Bm,shadowmap_pars_fragment:km,shadowmap_pars_vertex:zm,shadowmap_vertex:Vm,shadowmask_pars_fragment:Gm,skinbase_vertex:Hm,skinning_pars_vertex:Wm,skinning_vertex:Xm,skinnormal_vertex:qm,specularmap_fragment:Ym,specularmap_pars_fragment:Zm,tonemapping_fragment:Jm,tonemapping_pars_fragment:Km,transmission_fragment:$m,transmission_pars_fragment:jm,uv_pars_fragment:Qm,uv_pars_vertex:tg,uv_vertex:eg,worldpos_vertex:ng,background_vert:ig,background_frag:sg,backgroundCube_vert:rg,backgroundCube_frag:ag,cube_vert:og,cube_frag:lg,depth_vert:cg,depth_frag:hg,distance_vert:ug,distance_frag:fg,equirect_vert:dg,equirect_frag:pg,linedashed_vert:mg,linedashed_frag:gg,meshbasic_vert:_g,meshbasic_frag:xg,meshlambert_vert:yg,meshlambert_frag:vg,meshmatcap_vert:Sg,meshmatcap_frag:Mg,meshnormal_vert:bg,meshnormal_frag:wg,meshphong_vert:Ag,meshphong_frag:Tg,meshphysical_vert:Eg,meshphysical_frag:Cg,meshtoon_vert:Rg,meshtoon_frag:Pg,points_vert:Ig,points_frag:Dg,shadow_vert:Ug,shadow_frag:Lg,sprite_vert:Ng,sprite_frag:Fg},Et={common:{diffuse:{value:new ie(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ne},alphaMap:{value:null},alphaMapTransform:{value:new ne},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ne}},envmap:{envMap:{value:null},envMapRotation:{value:new ne},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ne}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ne}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ne},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ne},normalScale:{value:new Kt(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ne},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ne}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ne}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ne}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ie(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new H},probesMax:{value:new H},probesResolution:{value:new H}},points:{diffuse:{value:new ie(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ne},alphaTest:{value:0},uvTransform:{value:new ne}},sprite:{diffuse:{value:new ie(16777215)},opacity:{value:1},center:{value:new Kt(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ne},alphaMap:{value:null},alphaMapTransform:{value:new ne},alphaTest:{value:0}}},Yn={basic:{uniforms:nn([Et.common,Et.specularmap,Et.envmap,Et.aomap,Et.lightmap,Et.fog]),vertexShader:oe.meshbasic_vert,fragmentShader:oe.meshbasic_frag},lambert:{uniforms:nn([Et.common,Et.specularmap,Et.envmap,Et.aomap,Et.lightmap,Et.emissivemap,Et.bumpmap,Et.normalmap,Et.displacementmap,Et.fog,Et.lights,{emissive:{value:new ie(0)},envMapIntensity:{value:1}}]),vertexShader:oe.meshlambert_vert,fragmentShader:oe.meshlambert_frag},phong:{uniforms:nn([Et.common,Et.specularmap,Et.envmap,Et.aomap,Et.lightmap,Et.emissivemap,Et.bumpmap,Et.normalmap,Et.displacementmap,Et.fog,Et.lights,{emissive:{value:new ie(0)},specular:{value:new ie(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:oe.meshphong_vert,fragmentShader:oe.meshphong_frag},standard:{uniforms:nn([Et.common,Et.envmap,Et.aomap,Et.lightmap,Et.emissivemap,Et.bumpmap,Et.normalmap,Et.displacementmap,Et.roughnessmap,Et.metalnessmap,Et.fog,Et.lights,{emissive:{value:new ie(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:oe.meshphysical_vert,fragmentShader:oe.meshphysical_frag},toon:{uniforms:nn([Et.common,Et.aomap,Et.lightmap,Et.emissivemap,Et.bumpmap,Et.normalmap,Et.displacementmap,Et.gradientmap,Et.fog,Et.lights,{emissive:{value:new ie(0)}}]),vertexShader:oe.meshtoon_vert,fragmentShader:oe.meshtoon_frag},matcap:{uniforms:nn([Et.common,Et.bumpmap,Et.normalmap,Et.displacementmap,Et.fog,{matcap:{value:null}}]),vertexShader:oe.meshmatcap_vert,fragmentShader:oe.meshmatcap_frag},points:{uniforms:nn([Et.points,Et.fog]),vertexShader:oe.points_vert,fragmentShader:oe.points_frag},dashed:{uniforms:nn([Et.common,Et.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:oe.linedashed_vert,fragmentShader:oe.linedashed_frag},depth:{uniforms:nn([Et.common,Et.displacementmap]),vertexShader:oe.depth_vert,fragmentShader:oe.depth_frag},normal:{uniforms:nn([Et.common,Et.bumpmap,Et.normalmap,Et.displacementmap,{opacity:{value:1}}]),vertexShader:oe.meshnormal_vert,fragmentShader:oe.meshnormal_frag},sprite:{uniforms:nn([Et.sprite,Et.fog]),vertexShader:oe.sprite_vert,fragmentShader:oe.sprite_frag},background:{uniforms:{uvTransform:{value:new ne},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:oe.background_vert,fragmentShader:oe.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new ne}},vertexShader:oe.backgroundCube_vert,fragmentShader:oe.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:oe.cube_vert,fragmentShader:oe.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:oe.equirect_vert,fragmentShader:oe.equirect_frag},distance:{uniforms:nn([Et.common,Et.displacementmap,{referencePosition:{value:new H},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:oe.distance_vert,fragmentShader:oe.distance_frag},shadow:{uniforms:nn([Et.lights,Et.fog,{color:{value:new ie(0)},opacity:{value:1}}]),vertexShader:oe.shadow_vert,fragmentShader:oe.shadow_frag}};Yn.physical={uniforms:nn([Yn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ne},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ne},clearcoatNormalScale:{value:new Kt(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ne},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ne},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ne},sheen:{value:0},sheenColor:{value:new ie(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ne},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ne},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ne},transmissionSamplerSize:{value:new Kt},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ne},attenuationDistance:{value:0},attenuationColor:{value:new ie(0)},specularColor:{value:new ie(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ne},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ne},anisotropyVector:{value:new Kt},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ne}}]),vertexShader:oe.meshphysical_vert,fragmentShader:oe.meshphysical_frag};var tl={r:0,b:0,g:0},Og=new se,lf=new ne;lf.set(-1,0,0,0,1,0,0,0,1);function Bg(i,t,e,n,s,r){let a=new ie(0),o=s===!0?0:1,l,c,f=null,u=0,d=null;function p(R){let w=R.isScene===!0?R.background:null;if(w&&w.isTexture){let v=R.backgroundBlurriness>0;w=t.get(w,v)}return w}function g(R){let w=!1,v=p(R);v===null?m(a,o):v&&v.isColor&&(m(v,1),w=!0);let E=i.xr.getEnvironmentBlendMode();E==="additive"?e.buffers.color.setClear(0,0,0,1,r):E==="alpha-blend"&&e.buffers.color.setClear(0,0,0,0,r),(i.autoClear||w)&&(e.buffers.depth.setTest(!0),e.buffers.depth.setMask(!0),e.buffers.color.setMask(!0),i.clear(i.autoClearColor,i.autoClearDepth,i.autoClearStencil))}function y(R,w){let v=p(w);v&&(v.isCubeTexture||v.mapping===kr)?(c===void 0&&(c=new ve(new Hn(1,1,1),new _n({name:"BackgroundCubeMaterial",uniforms:ts(Yn.backgroundCube.uniforms),vertexShader:Yn.backgroundCube.vertexShader,fragmentShader:Yn.backgroundCube.fragmentShader,side:Xe,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(E,C,D){this.matrixWorld.copyPosition(D.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),n.update(c)),c.material.uniforms.envMap.value=v,c.material.uniforms.backgroundBlurriness.value=w.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Og.makeRotationFromEuler(w.backgroundRotation)).transpose(),v.isCubeTexture&&v.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(lf),c.material.toneMapped=ce.getTransfer(v.colorSpace)!==me,(f!==v||u!==v.version||d!==i.toneMapping)&&(c.material.needsUpdate=!0,f=v,u=v.version,d=i.toneMapping),c.layers.enableAll(),R.unshift(c,c.geometry,c.material,0,0,null)):v&&v.isTexture&&(l===void 0&&(l=new ve(new Cr(2,2),new _n({name:"BackgroundMaterial",uniforms:ts(Yn.background.uniforms),vertexShader:Yn.background.vertexShader,fragmentShader:Yn.background.fragmentShader,side:ai,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),n.update(l)),l.material.uniforms.t2D.value=v,l.material.uniforms.backgroundIntensity.value=w.backgroundIntensity,l.material.toneMapped=ce.getTransfer(v.colorSpace)!==me,v.matrixAutoUpdate===!0&&v.updateMatrix(),l.material.uniforms.uvTransform.value.copy(v.matrix),(f!==v||u!==v.version||d!==i.toneMapping)&&(l.material.needsUpdate=!0,f=v,u=v.version,d=i.toneMapping),l.layers.enableAll(),R.unshift(l,l.geometry,l.material,0,0,null))}function m(R,w){R.getRGB(tl,Sc(i)),e.buffers.color.setClear(tl.r,tl.g,tl.b,w,r)}function _(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(R,w=1){a.set(R),o=w,m(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(R){o=R,m(a,o)},render:g,addToRenderList:y,dispose:_}}function kg(i,t){let e=i.getParameter(i.MAX_VERTEX_ATTRIBS),n={},s=d(null),r=s,a=!1;function o(N,F,Y,J,O){let K=!1,Z=u(N,J,Y,F);r!==Z&&(r=Z,c(r.object)),K=p(N,J,Y,O),K&&g(N,J,Y,O),O!==null&&t.update(O,i.ELEMENT_ARRAY_BUFFER),(K||a)&&(a=!1,v(N,F,Y,J),O!==null&&i.bindBuffer(i.ELEMENT_ARRAY_BUFFER,t.get(O).buffer))}function l(){return i.createVertexArray()}function c(N){return i.bindVertexArray(N)}function f(N){return i.deleteVertexArray(N)}function u(N,F,Y,J){let O=J.wireframe===!0,K=n[F.id];K===void 0&&(K={},n[F.id]=K);let Z=N.isInstancedMesh===!0?N.id:0,st=K[Z];st===void 0&&(st={},K[Z]=st);let lt=st[Y.id];lt===void 0&&(lt={},st[Y.id]=lt);let St=lt[O];return St===void 0&&(St=d(l()),lt[O]=St),St}function d(N){let F=[],Y=[],J=[];for(let O=0;O<e;O++)F[O]=0,Y[O]=0,J[O]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:F,enabledAttributes:Y,attributeDivisors:J,object:N,attributes:{},index:null}}function p(N,F,Y,J){let O=r.attributes,K=F.attributes,Z=0,st=Y.getAttributes();for(let lt in st)if(st[lt].location>=0){let mt=O[lt],vt=K[lt];if(vt===void 0&&(lt==="instanceMatrix"&&N.instanceMatrix&&(vt=N.instanceMatrix),lt==="instanceColor"&&N.instanceColor&&(vt=N.instanceColor)),mt===void 0||mt.attribute!==vt||vt&&mt.data!==vt.data)return!0;Z++}return r.attributesNum!==Z||r.index!==J}function g(N,F,Y,J){let O={},K=F.attributes,Z=0,st=Y.getAttributes();for(let lt in st)if(st[lt].location>=0){let mt=K[lt];mt===void 0&&(lt==="instanceMatrix"&&N.instanceMatrix&&(mt=N.instanceMatrix),lt==="instanceColor"&&N.instanceColor&&(mt=N.instanceColor));let vt={};vt.attribute=mt,mt&&mt.data&&(vt.data=mt.data),O[lt]=vt,Z++}r.attributes=O,r.attributesNum=Z,r.index=J}function y(){let N=r.newAttributes;for(let F=0,Y=N.length;F<Y;F++)N[F]=0}function m(N){_(N,0)}function _(N,F){let Y=r.newAttributes,J=r.enabledAttributes,O=r.attributeDivisors;Y[N]=1,J[N]===0&&(i.enableVertexAttribArray(N),J[N]=1),O[N]!==F&&(i.vertexAttribDivisor(N,F),O[N]=F)}function R(){let N=r.newAttributes,F=r.enabledAttributes;for(let Y=0,J=F.length;Y<J;Y++)F[Y]!==N[Y]&&(i.disableVertexAttribArray(Y),F[Y]=0)}function w(N,F,Y,J,O,K,Z){Z===!0?i.vertexAttribIPointer(N,F,Y,O,K):i.vertexAttribPointer(N,F,Y,J,O,K)}function v(N,F,Y,J){y();let O=J.attributes,K=Y.getAttributes(),Z=F.defaultAttributeValues;for(let st in K){let lt=K[st];if(lt.location>=0){let St=O[st];if(St===void 0&&(st==="instanceMatrix"&&N.instanceMatrix&&(St=N.instanceMatrix),st==="instanceColor"&&N.instanceColor&&(St=N.instanceColor)),St!==void 0){let mt=St.normalized,vt=St.itemSize,qt=t.get(St);if(qt===void 0)continue;let Qt=qt.buffer,kt=qt.type,tt=qt.bytesPerElement,ot=kt===i.INT||kt===i.UNSIGNED_INT||St.gpuType===go;if(St.isInterleavedBufferAttribute){let ht=St.data,gt=ht.stride,Nt=St.offset;if(ht.isInstancedInterleavedBuffer){for(let Lt=0;Lt<lt.locationSize;Lt++)_(lt.location+Lt,ht.meshPerAttribute);N.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=ht.meshPerAttribute*ht.count)}else for(let Lt=0;Lt<lt.locationSize;Lt++)m(lt.location+Lt);i.bindBuffer(i.ARRAY_BUFFER,Qt);for(let Lt=0;Lt<lt.locationSize;Lt++)w(lt.location+Lt,vt/lt.locationSize,kt,mt,gt*tt,(Nt+vt/lt.locationSize*Lt)*tt,ot)}else{if(St.isInstancedBufferAttribute){for(let ht=0;ht<lt.locationSize;ht++)_(lt.location+ht,St.meshPerAttribute);N.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=St.meshPerAttribute*St.count)}else for(let ht=0;ht<lt.locationSize;ht++)m(lt.location+ht);i.bindBuffer(i.ARRAY_BUFFER,Qt);for(let ht=0;ht<lt.locationSize;ht++)w(lt.location+ht,vt/lt.locationSize,kt,mt,vt*tt,vt/lt.locationSize*ht*tt,ot)}}else if(Z!==void 0){let mt=Z[st];if(mt!==void 0)switch(mt.length){case 2:i.vertexAttrib2fv(lt.location,mt);break;case 3:i.vertexAttrib3fv(lt.location,mt);break;case 4:i.vertexAttrib4fv(lt.location,mt);break;default:i.vertexAttrib1fv(lt.location,mt)}}}}R()}function E(){T();for(let N in n){let F=n[N];for(let Y in F){let J=F[Y];for(let O in J){let K=J[O];for(let Z in K)f(K[Z].object),delete K[Z];delete J[O]}}delete n[N]}}function C(N){if(n[N.id]===void 0)return;let F=n[N.id];for(let Y in F){let J=F[Y];for(let O in J){let K=J[O];for(let Z in K)f(K[Z].object),delete K[Z];delete J[O]}}delete n[N.id]}function D(N){for(let F in n){let Y=n[F];for(let J in Y){let O=Y[J];if(O[N.id]===void 0)continue;let K=O[N.id];for(let Z in K)f(K[Z].object),delete K[Z];delete O[N.id]}}}function S(N){for(let F in n){let Y=n[F],J=N.isInstancedMesh===!0?N.id:0,O=Y[J];if(O!==void 0){for(let K in O){let Z=O[K];for(let st in Z)f(Z[st].object),delete Z[st];delete O[K]}delete Y[J],Object.keys(Y).length===0&&delete n[F]}}}function T(){L(),a=!0,r!==s&&(r=s,c(r.object))}function L(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:o,reset:T,resetDefaultState:L,dispose:E,releaseStatesOfGeometry:C,releaseStatesOfObject:S,releaseStatesOfProgram:D,initAttributes:y,enableAttribute:m,disableUnusedAttributes:R}}function zg(i,t,e){let n;function s(l){n=l}function r(l,c){i.drawArrays(n,l,c),e.update(c,n,1)}function a(l,c,f){f!==0&&(i.drawArraysInstanced(n,l,c,f),e.update(c,n,f))}function o(l,c,f){if(f===0)return;t.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,c,0,f);let d=0;for(let p=0;p<f;p++)d+=c[p];e.update(d,n,1)}this.setMode=s,this.render=r,this.renderInstances=a,this.renderMultiDraw=o}function Vg(i,t,e,n){let s;function r(){if(s!==void 0)return s;if(t.has("EXT_texture_filter_anisotropic")===!0){let D=t.get("EXT_texture_filter_anisotropic");s=i.getParameter(D.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function a(D){return!(D!==Le&&n.convert(D)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(D){let S=D===en&&(t.has("EXT_color_buffer_half_float")||t.has("EXT_color_buffer_float"));return!(D!==ln&&n.convert(D)!==i.getParameter(i.IMPLEMENTATION_COLOR_READ_TYPE)&&D!==qe&&!S)}function l(D){if(D==="highp"){if(i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.HIGH_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.HIGH_FLOAT).precision>0)return"highp";D="mediump"}return D==="mediump"&&i.getShaderPrecisionFormat(i.VERTEX_SHADER,i.MEDIUM_FLOAT).precision>0&&i.getShaderPrecisionFormat(i.FRAGMENT_SHADER,i.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=e.precision!==void 0?e.precision:"highp",f=l(c);f!==c&&(Jt("WebGLRenderer:",c,"not supported, using",f,"instead."),c=f);let u=e.logarithmicDepthBuffer===!0,d=e.reversedDepthBuffer===!0&&t.has("EXT_clip_control");e.reversedDepthBuffer===!0&&d===!1&&Jt("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");let p=i.getParameter(i.MAX_TEXTURE_IMAGE_UNITS),g=i.getParameter(i.MAX_VERTEX_TEXTURE_IMAGE_UNITS),y=i.getParameter(i.MAX_TEXTURE_SIZE),m=i.getParameter(i.MAX_CUBE_MAP_TEXTURE_SIZE),_=i.getParameter(i.MAX_VERTEX_ATTRIBS),R=i.getParameter(i.MAX_VERTEX_UNIFORM_VECTORS),w=i.getParameter(i.MAX_VARYING_VECTORS),v=i.getParameter(i.MAX_FRAGMENT_UNIFORM_VECTORS),E=i.getParameter(i.MAX_SAMPLES),C=i.getParameter(i.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:u,reversedDepthBuffer:d,maxTextures:p,maxVertexTextures:g,maxTextureSize:y,maxCubemapSize:m,maxAttributes:_,maxVertexUniforms:R,maxVaryings:w,maxFragmentUniforms:v,maxSamples:E,samples:C}}function Gg(i){let t=this,e=null,n=0,s=!1,r=!1,a=new Mn,o=new ne,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d){let p=u.length!==0||d||n!==0||s;return s=d,n=u.length,p},this.beginShadows=function(){r=!0,f(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,d){e=f(u,d,0)},this.setState=function(u,d,p){let g=u.clippingPlanes,y=u.clipIntersection,m=u.clipShadows,_=i.get(u);if(!s||g===null||g.length===0||r&&!m)r?f(null):c();else{let R=r?0:n,w=R*4,v=_.clippingState||null;l.value=v,v=f(g,d,w,p);for(let E=0;E!==w;++E)v[E]=e[E];_.clippingState=v,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=R}};function c(){l.value!==e&&(l.value=e,l.needsUpdate=n>0),t.numPlanes=n,t.numIntersection=0}function f(u,d,p,g){let y=u!==null?u.length:0,m=null;if(y!==0){if(m=l.value,g!==!0||m===null){let _=p+y*4,R=d.matrixWorldInverse;o.getNormalMatrix(R),(m===null||m.length<_)&&(m=new Float32Array(_));for(let w=0,v=p;w!==y;++w,v+=4)a.copy(u[w]).applyMatrix4(R,o),a.normal.toArray(m,v),m[v+3]=a.constant}l.value=m,l.needsUpdate=!0}return t.numPlanes=y,t.numIntersection=0,m}}var Di=4,Bu=[.125,.215,.35,.446,.526,.582],es=20,Hg=256,Zr=new ui,ku=new ie,Pc=null,Ic=0,Dc=0,Uc=!1,Wg=new H,$r=class{constructor(t){this._renderer=t,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(t,e=0,n=.1,s=100,r={}){let{size:a=256,position:o=Wg}=r;Pc=this._renderer.getRenderTarget(),Ic=this._renderer.getActiveCubeFace(),Dc=this._renderer.getActiveMipmapLevel(),Uc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);let l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(t,n,s,l,o),e>0&&this._blur(l,0,0,e),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(t,e=null){return this._fromTexture(t,e)}fromCubemap(t,e=null){return this._fromTexture(t,e)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Gu(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Vu(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(t){this._lodMax=Math.floor(Math.log2(t)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let t=0;t<this._lodMeshes.length;t++)this._lodMeshes[t].geometry.dispose()}_cleanup(t){this._renderer.setRenderTarget(Pc,Ic,Dc),this._renderer.xr.enabled=Uc,t.scissorTest=!1,Ws(t,0,0,t.width,t.height)}_fromTexture(t,e){t.mapping===Ri||t.mapping===Qi?this._setSize(t.image.length===0?16:t.image[0].width||t.image[0].image.width):this._setSize(t.image.width/4),Pc=this._renderer.getRenderTarget(),Ic=this._renderer.getActiveCubeFace(),Dc=this._renderer.getActiveMipmapLevel(),Uc=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=e||this._allocateTargets();return this._textureToCubeUV(t,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let t=3*Math.max(this._cubeSize,112),e=4*this._cubeSize,n={magFilter:Te,minFilter:Te,generateMipmaps:!1,type:en,format:Le,colorSpace:pn,depthBuffer:!1},s=zu(t,e,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==t||this._pingPongRenderTarget.height!==e){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=zu(t,e,n);let{_lodMax:r}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=Xg(r)),this._blurMaterial=Yg(r,t,e),this._ggxMaterial=qg(r,t,e)}return s}_compileMaterial(t){let e=new ve(new tn,t);this._renderer.compile(e,Zr)}_sceneToCubeUV(t,e,n,s,r){let l=new Ge(90,1,e,n),c=[1,-1,1,1,1,1],f=[1,1,1,-1,-1,-1],u=this._renderer,d=u.autoClear,p=u.toneMapping;u.getClearColor(ku),u.toneMapping=Dn,u.autoClear=!1,u.state.buffers.depth.getReversed()&&(u.setRenderTarget(s),u.clearDepth(),u.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new ve(new Hn,new gr({name:"PMREM.Background",side:Xe,depthWrite:!1,depthTest:!1})));let y=this._backgroundBox,m=y.material,_=!1,R=t.background;R?R.isColor&&(m.color.copy(R),t.background=null,_=!0):(m.color.copy(ku),_=!0);for(let w=0;w<6;w++){let v=w%3;v===0?(l.up.set(0,c[w],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x+f[w],r.y,r.z)):v===1?(l.up.set(0,0,c[w]),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y+f[w],r.z)):(l.up.set(0,c[w],0),l.position.set(r.x,r.y,r.z),l.lookAt(r.x,r.y,r.z+f[w]));let E=this._cubeSize;Ws(s,v*E,w>2?E:0,E,E),u.setRenderTarget(s),_&&u.render(y,l),u.render(t,l)}u.toneMapping=p,u.autoClear=d,t.background=R}_textureToCubeUV(t,e){let n=this._renderer,s=t.mapping===Ri||t.mapping===Qi;s?(this._cubemapMaterial===null&&(this._cubemapMaterial=Gu()),this._cubemapMaterial.uniforms.flipEnvMap.value=t.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Vu());let r=s?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=r;let o=r.uniforms;o.envMap.value=t;let l=this._cubeSize;Ws(e,0,0,3*l,2*l),n.setRenderTarget(e),n.render(a,Zr)}_applyPMREM(t){let e=this._renderer,n=e.autoClear;e.autoClear=!1;let s=this._lodMeshes.length;for(let r=1;r<s;r++)this._applyGGXFilter(t,r-1,r);e.autoClear=n}_applyGGXFilter(t,e,n){let s=this._renderer,r=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[n];o.material=a;let l=a.uniforms,c=n/(this._lodMeshes.length-1),f=e/(this._lodMeshes.length-1),u=Math.sqrt(c*c-f*f),d=0+c*1.25,p=u*d,{_lodMax:g}=this,y=this._sizeLods[n],m=3*y*(n>g-Di?n-g+Di:0),_=4*(this._cubeSize-y);l.envMap.value=t.texture,l.roughness.value=p,l.mipInt.value=g-e,Ws(r,m,_,3*y,2*y),s.setRenderTarget(r),s.render(o,Zr),l.envMap.value=r.texture,l.roughness.value=0,l.mipInt.value=g-n,Ws(t,m,_,3*y,2*y),s.setRenderTarget(t),s.render(o,Zr)}_blur(t,e,n,s,r){let a=this._pingPongRenderTarget;this._halfBlur(t,a,e,n,s,"latitudinal",r),this._halfBlur(a,t,n,n,s,"longitudinal",r)}_halfBlur(t,e,n,s,r,a,o){let l=this._renderer,c=this._blurMaterial;a!=="latitudinal"&&a!=="longitudinal"&&jt("blur direction must be either latitudinal or longitudinal!");let f=3,u=this._lodMeshes[s];u.material=c;let d=c.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*es-1),y=r/g,m=isFinite(r)?1+Math.floor(f*y):es;m>es&&Jt(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${es}`);let _=[],R=0;for(let D=0;D<es;++D){let S=D/y,T=Math.exp(-S*S/2);_.push(T),D===0?R+=T:D<m&&(R+=2*T)}for(let D=0;D<_.length;D++)_[D]=_[D]/R;d.envMap.value=t.texture,d.samples.value=m,d.weights.value=_,d.latitudinal.value=a==="latitudinal",o&&(d.poleAxis.value=o);let{_lodMax:w}=this;d.dTheta.value=g,d.mipInt.value=w-n;let v=this._sizeLods[s],E=3*v*(s>w-Di?s-w+Di:0),C=4*(this._cubeSize-v);Ws(e,E,C,3*v,2*v),l.setRenderTarget(e),l.render(u,Zr)}};function Xg(i){let t=[],e=[],n=[],s=i,r=i-Di+1+Bu.length;for(let a=0;a<r;a++){let o=Math.pow(2,s);t.push(o);let l=1/o;a>i-Di?l=Bu[a-i+Di-1]:a===0&&(l=0),e.push(l);let c=1/(o-2),f=-c,u=1+c,d=[f,f,u,f,u,u,f,f,u,u,f,u],p=6,g=6,y=3,m=2,_=1,R=new Float32Array(y*g*p),w=new Float32Array(m*g*p),v=new Float32Array(_*g*p);for(let C=0;C<p;C++){let D=C%3*2/3-1,S=C>2?0:-1,T=[D,S,0,D+2/3,S,0,D+2/3,S+1,0,D,S,0,D+2/3,S+1,0,D,S+1,0];R.set(T,y*g*C),w.set(d,m*g*C);let L=[C,C,C,C,C,C];v.set(L,_*g*C)}let E=new tn;E.setAttribute("position",new xe(R,y)),E.setAttribute("uv",new xe(w,m)),E.setAttribute("faceIndex",new xe(v,_)),n.push(new ve(E,null)),s>Di&&s--}return{lodMeshes:n,sizeLods:t,sigmas:e}}function zu(i,t,e){let n=new mn(i,t,e);return n.texture.mapping=kr,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function Ws(i,t,e,n,s){i.viewport.set(t,e,n,s),i.scissor.set(t,e,n,s)}function qg(i,t,e){return new _n({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Hg,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:il(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Xn,depthTest:!1,depthWrite:!1})}function Yg(i,t,e){let n=new Float32Array(es),s=new H(0,1,0);return new _n({name:"SphericalGaussianBlur",defines:{n:es,CUBEUV_TEXEL_WIDTH:1/t,CUBEUV_TEXEL_HEIGHT:1/e,CUBEUV_MAX_MIP:`${i}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:s}},vertexShader:il(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Xn,depthTest:!1,depthWrite:!1})}function Vu(){return new _n({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:il(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Xn,depthTest:!1,depthWrite:!1})}function Gu(){return new _n({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:il(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Xn,depthTest:!1,depthWrite:!1})}function il(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}var nl=class extends mn{constructor(t=1,e={}){super(t,t,e),this.isWebGLCubeRenderTarget=!0;let n={width:t,height:t,depth:1},s=[n,n,n,n,n,n];this.texture=new Sr(s),this._setTextureOptions(e),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(t,e){this.texture.type=e.type,this.texture.colorSpace=e.colorSpace,this.texture.generateMipmaps=e.generateMipmaps,this.texture.minFilter=e.minFilter,this.texture.magFilter=e.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new Hn(5,5,5),r=new _n({name:"CubemapFromEquirect",uniforms:ts(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Xe,blending:Xn});r.uniforms.tEquirect.value=e;let a=new ve(s,r),o=e.minFilter;return e.minFilter===fi&&(e.minFilter=Te),new oo(1,10,this).update(t,a),e.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(t,e=!0,n=!0,s=!0){let r=t.getRenderTarget();for(let a=0;a<6;a++)t.setRenderTarget(this,a),t.clear(e,n,s);t.setRenderTarget(r)}};function Zg(i){let t=new WeakMap,e=new WeakMap,n=null;function s(d,p=!1){return d==null?null:p?a(d):r(d)}function r(d){if(d&&d.isTexture){let p=d.mapping;if(p===fo||p===po)if(t.has(d)){let g=t.get(d).texture;return o(g,d.mapping)}else{let g=d.image;if(g&&g.height>0){let y=new nl(g.height);return y.fromEquirectangularTexture(i,d),t.set(d,y),d.addEventListener("dispose",c),o(y.texture,d.mapping)}else return null}}return d}function a(d){if(d&&d.isTexture){let p=d.mapping,g=p===fo||p===po,y=p===Ri||p===Qi;if(g||y){let m=e.get(d),_=m!==void 0?m.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==_)return n===null&&(n=new $r(i)),m=g?n.fromEquirectangular(d,m):n.fromCubemap(d,m),m.texture.pmremVersion=d.pmremVersion,e.set(d,m),m.texture;if(m!==void 0)return m.texture;{let R=d.image;return g&&R&&R.height>0||y&&R&&l(R)?(n===null&&(n=new $r(i)),m=g?n.fromEquirectangular(d):n.fromCubemap(d),m.texture.pmremVersion=d.pmremVersion,e.set(d,m),d.addEventListener("dispose",f),m.texture):null}}}return d}function o(d,p){return p===fo?d.mapping=Ri:p===po&&(d.mapping=Qi),d}function l(d){let p=0,g=6;for(let y=0;y<g;y++)d[y]!==void 0&&p++;return p===g}function c(d){let p=d.target;p.removeEventListener("dispose",c);let g=t.get(p);g!==void 0&&(t.delete(p),g.dispose())}function f(d){let p=d.target;p.removeEventListener("dispose",f);let g=e.get(p);g!==void 0&&(e.delete(p),g.dispose())}function u(){t=new WeakMap,e=new WeakMap,n!==null&&(n.dispose(),n=null)}return{get:s,dispose:u}}function Jg(i){let t={};function e(n){if(t[n]!==void 0)return t[n];let s=i.getExtension(n);return t[n]=s,s}return{has:function(n){return e(n)!==null},init:function(){e("EXT_color_buffer_float"),e("WEBGL_clip_cull_distance"),e("OES_texture_float_linear"),e("EXT_color_buffer_half_float"),e("WEBGL_multisampled_render_to_texture"),e("WEBGL_render_shared_exponent")},get:function(n){let s=e(n);return s===null&&Vi("WebGLRenderer: "+n+" extension not supported."),s}}}function Kg(i,t,e,n){let s={},r=new WeakMap;function a(u){let d=u.target;d.index!==null&&t.remove(d.index);for(let g in d.attributes)t.remove(d.attributes[g]);d.removeEventListener("dispose",a),delete s[d.id];let p=r.get(d);p&&(t.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,e.memory.geometries--}function o(u,d){return s[d.id]===!0||(d.addEventListener("dispose",a),s[d.id]=!0,e.memory.geometries++),d}function l(u){let d=u.attributes;for(let p in d)t.update(d[p],i.ARRAY_BUFFER)}function c(u){let d=[],p=u.index,g=u.attributes.position,y=0;if(g===void 0)return;if(p!==null){let R=p.array;y=p.version;for(let w=0,v=R.length;w<v;w+=3){let E=R[w+0],C=R[w+1],D=R[w+2];d.push(E,C,C,D,D,E)}}else{let R=g.array;y=g.version;for(let w=0,v=R.length/3-1;w<v;w+=3){let E=w+0,C=w+1,D=w+2;d.push(E,C,C,D,D,E)}}let m=new(g.count>=65535?mr:pr)(d,1);m.version=y;let _=r.get(u);_&&t.remove(_),r.set(u,m)}function f(u){let d=r.get(u);if(d){let p=u.index;p!==null&&d.version<p.version&&c(u)}else c(u);return r.get(u)}return{get:o,update:l,getWireframeAttribute:f}}function $g(i,t,e){let n;function s(u){n=u}let r,a;function o(u){r=u.type,a=u.bytesPerElement}function l(u,d){i.drawElements(n,d,r,u*a),e.update(d,n,1)}function c(u,d,p){p!==0&&(i.drawElementsInstanced(n,d,r,u*a,p),e.update(d,n,p))}function f(u,d,p){if(p===0)return;t.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,d,0,r,u,0,p);let y=0;for(let m=0;m<p;m++)y+=d[m];e.update(y,n,1)}this.setMode=s,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=f}function jg(i){let t={geometries:0,textures:0},e={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,a,o){switch(e.calls++,a){case i.TRIANGLES:e.triangles+=o*(r/3);break;case i.LINES:e.lines+=o*(r/2);break;case i.LINE_STRIP:e.lines+=o*(r-1);break;case i.LINE_LOOP:e.lines+=o*r;break;case i.POINTS:e.points+=o*r;break;default:jt("WebGLInfo: Unknown draw mode:",a);break}}function s(){e.calls=0,e.triangles=0,e.points=0,e.lines=0}return{memory:t,render:e,programs:null,autoReset:!0,reset:s,update:n}}function Qg(i,t,e){let n=new WeakMap,s=new ge;function r(a,o,l){let c=a.morphTargetInfluences,f=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,u=f!==void 0?f.length:0,d=n.get(o);if(d===void 0||d.count!==u){let T=function(){D.dispose(),n.delete(o),o.removeEventListener("dispose",T)};d!==void 0&&d.texture.dispose();let p=o.morphAttributes.position!==void 0,g=o.morphAttributes.normal!==void 0,y=o.morphAttributes.color!==void 0,m=o.morphAttributes.position||[],_=o.morphAttributes.normal||[],R=o.morphAttributes.color||[],w=0;p===!0&&(w=1),g===!0&&(w=2),y===!0&&(w=3);let v=o.attributes.position.count*w,E=1;v>t.maxTextureSize&&(E=Math.ceil(v/t.maxTextureSize),v=t.maxTextureSize);let C=new Float32Array(v*E*4*u),D=new fr(C,v,E,u);D.type=qe,D.needsUpdate=!0;let S=w*4;for(let L=0;L<u;L++){let N=m[L],F=_[L],Y=R[L],J=v*E*4*L;for(let O=0;O<N.count;O++){let K=O*S;p===!0&&(s.fromBufferAttribute(N,O),C[J+K+0]=s.x,C[J+K+1]=s.y,C[J+K+2]=s.z,C[J+K+3]=0),g===!0&&(s.fromBufferAttribute(F,O),C[J+K+4]=s.x,C[J+K+5]=s.y,C[J+K+6]=s.z,C[J+K+7]=0),y===!0&&(s.fromBufferAttribute(Y,O),C[J+K+8]=s.x,C[J+K+9]=s.y,C[J+K+10]=s.z,C[J+K+11]=Y.itemSize===4?s.w:1)}}d={count:u,texture:D,size:new Kt(v,E)},n.set(o,d),o.addEventListener("dispose",T)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(i,"morphTexture",a.morphTexture,e);else{let p=0;for(let y=0;y<c.length;y++)p+=c[y];let g=o.morphTargetsRelative?1:1-p;l.getUniforms().setValue(i,"morphTargetBaseInfluence",g),l.getUniforms().setValue(i,"morphTargetInfluences",c)}l.getUniforms().setValue(i,"morphTargetsTexture",d.texture,e),l.getUniforms().setValue(i,"morphTargetsTextureSize",d.size)}return{update:r}}function t0(i,t,e,n,s){let r=new WeakMap;function a(c){let f=s.render.frame,u=c.geometry,d=t.get(c,u);if(r.get(d)!==f&&(t.update(d),r.set(d,f)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),r.get(c)!==f&&(e.update(c.instanceMatrix,i.ARRAY_BUFFER),c.instanceColor!==null&&e.update(c.instanceColor,i.ARRAY_BUFFER),r.set(c,f))),c.isSkinnedMesh){let p=c.skeleton;r.get(p)!==f&&(p.update(),r.set(p,f))}return d}function o(){r=new WeakMap}function l(c){let f=c.target;f.removeEventListener("dispose",l),n.releaseStatesOfObject(f),e.remove(f.instanceMatrix),f.instanceColor!==null&&e.remove(f.instanceColor)}return{update:a,dispose:o}}var e0={[sc]:"LINEAR_TONE_MAPPING",[rc]:"REINHARD_TONE_MAPPING",[ac]:"CINEON_TONE_MAPPING",[uo]:"ACES_FILMIC_TONE_MAPPING",[lc]:"AGX_TONE_MAPPING",[cc]:"NEUTRAL_TONE_MAPPING",[oc]:"CUSTOM_TONE_MAPPING"};function n0(i,t,e,n,s,r){let a=new mn(t,e,{type:i,depthBuffer:s,stencilBuffer:r,samples:n?4:0,depthTexture:s?new li(t,e):void 0}),o=new mn(t,e,{type:en,depthBuffer:!1,stencilBuffer:!1}),l=new tn;l.setAttribute("position",new Ue([-1,3,0,-1,-1,0,3,-1,0],3)),l.setAttribute("uv",new Ue([0,2,0,0,2,0],2));let c=new ja({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),f=new ve(l,c),u=new ui(-1,1,1,-1,0,1),d=null,p=null,g=!1,y,m=null,_=[],R=!1;this.setSize=function(w,v){a.setSize(w,v),o.setSize(w,v);for(let E=0;E<_.length;E++){let C=_[E];C.setSize&&C.setSize(w,v)}},this.setEffects=function(w){_=w,R=_.length>0&&_[0].isRenderPass===!0;let v=a.width,E=a.height;for(let C=0;C<_.length;C++){let D=_[C];D.setSize&&D.setSize(v,E)}},this.begin=function(w,v){if(g||w.toneMapping===Dn&&_.length===0)return!1;if(m=v,v!==null){let E=v.width,C=v.height;(a.width!==E||a.height!==C)&&this.setSize(E,C)}return R===!1&&w.setRenderTarget(a),y=w.toneMapping,w.toneMapping=Dn,!0},this.hasRenderPass=function(){return R},this.end=function(w,v){w.toneMapping=y,g=!0;let E=a,C=o;for(let D=0;D<_.length;D++){let S=_[D];if(S.enabled!==!1&&(S.render(w,C,E,v),S.needsSwap!==!1)){let T=E;E=C,C=T}}if(d!==w.outputColorSpace||p!==w.toneMapping){d=w.outputColorSpace,p=w.toneMapping,c.defines={},ce.getTransfer(d)===me&&(c.defines.SRGB_TRANSFER="");let D=e0[p];D&&(c.defines[D]=""),c.needsUpdate=!0}c.uniforms.tDiffuse.value=E.texture,w.setRenderTarget(m),w.render(f,u),m=null,g=!1},this.isCompositing=function(){return g},this.dispose=function(){a.depthTexture&&a.depthTexture.dispose(),a.dispose(),o.dispose(),l.dispose(),c.dispose()}}var cf=new Qe,Fc=new li(1,1),hf=new fr,uf=new Ka,ff=new Sr,Hu=[],Wu=[],Xu=new Float32Array(16),qu=new Float32Array(9),Yu=new Float32Array(4);function qs(i,t,e){let n=i[0];if(n<=0||n>0)return i;let s=t*e,r=Hu[s];if(r===void 0&&(r=new Float32Array(s),Hu[s]=r),t!==0){n.toArray(r,0);for(let a=1,o=0;a!==t;++a)o+=e,i[a].toArray(r,o)}return r}function Oe(i,t){if(i.length!==t.length)return!1;for(let e=0,n=i.length;e<n;e++)if(i[e]!==t[e])return!1;return!0}function Be(i,t){for(let e=0,n=t.length;e<n;e++)i[e]=t[e]}function sl(i,t){let e=Wu[t];e===void 0&&(e=new Int32Array(t),Wu[t]=e);for(let n=0;n!==t;++n)e[n]=i.allocateTextureUnit();return e}function i0(i,t){let e=this.cache;e[0]!==t&&(i.uniform1f(this.addr,t),e[0]=t)}function s0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2f(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Oe(e,t))return;i.uniform2fv(this.addr,t),Be(e,t)}}function r0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3f(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else if(t.r!==void 0)(e[0]!==t.r||e[1]!==t.g||e[2]!==t.b)&&(i.uniform3f(this.addr,t.r,t.g,t.b),e[0]=t.r,e[1]=t.g,e[2]=t.b);else{if(Oe(e,t))return;i.uniform3fv(this.addr,t),Be(e,t)}}function a0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4f(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Oe(e,t))return;i.uniform4fv(this.addr,t),Be(e,t)}}function o0(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Oe(e,t))return;i.uniformMatrix2fv(this.addr,!1,t),Be(e,t)}else{if(Oe(e,n))return;Yu.set(n),i.uniformMatrix2fv(this.addr,!1,Yu),Be(e,n)}}function l0(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Oe(e,t))return;i.uniformMatrix3fv(this.addr,!1,t),Be(e,t)}else{if(Oe(e,n))return;qu.set(n),i.uniformMatrix3fv(this.addr,!1,qu),Be(e,n)}}function c0(i,t){let e=this.cache,n=t.elements;if(n===void 0){if(Oe(e,t))return;i.uniformMatrix4fv(this.addr,!1,t),Be(e,t)}else{if(Oe(e,n))return;Xu.set(n),i.uniformMatrix4fv(this.addr,!1,Xu),Be(e,n)}}function h0(i,t){let e=this.cache;e[0]!==t&&(i.uniform1i(this.addr,t),e[0]=t)}function u0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2i(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Oe(e,t))return;i.uniform2iv(this.addr,t),Be(e,t)}}function f0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3i(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Oe(e,t))return;i.uniform3iv(this.addr,t),Be(e,t)}}function d0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4i(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Oe(e,t))return;i.uniform4iv(this.addr,t),Be(e,t)}}function p0(i,t){let e=this.cache;e[0]!==t&&(i.uniform1ui(this.addr,t),e[0]=t)}function m0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y)&&(i.uniform2ui(this.addr,t.x,t.y),e[0]=t.x,e[1]=t.y);else{if(Oe(e,t))return;i.uniform2uiv(this.addr,t),Be(e,t)}}function g0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z)&&(i.uniform3ui(this.addr,t.x,t.y,t.z),e[0]=t.x,e[1]=t.y,e[2]=t.z);else{if(Oe(e,t))return;i.uniform3uiv(this.addr,t),Be(e,t)}}function _0(i,t){let e=this.cache;if(t.x!==void 0)(e[0]!==t.x||e[1]!==t.y||e[2]!==t.z||e[3]!==t.w)&&(i.uniform4ui(this.addr,t.x,t.y,t.z,t.w),e[0]=t.x,e[1]=t.y,e[2]=t.z,e[3]=t.w);else{if(Oe(e,t))return;i.uniform4uiv(this.addr,t),Be(e,t)}}function x0(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s);let r;this.type===i.SAMPLER_2D_SHADOW?(Fc.compareFunction=e.isReversedDepthBuffer()?Qo:jo,r=Fc):r=cf,e.setTexture2D(t||r,s)}function y0(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture3D(t||uf,s)}function v0(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTextureCube(t||ff,s)}function S0(i,t,e){let n=this.cache,s=e.allocateTextureUnit();n[0]!==s&&(i.uniform1i(this.addr,s),n[0]=s),e.setTexture2DArray(t||hf,s)}function M0(i){switch(i){case 5126:return i0;case 35664:return s0;case 35665:return r0;case 35666:return a0;case 35674:return o0;case 35675:return l0;case 35676:return c0;case 5124:case 35670:return h0;case 35667:case 35671:return u0;case 35668:case 35672:return f0;case 35669:case 35673:return d0;case 5125:return p0;case 36294:return m0;case 36295:return g0;case 36296:return _0;case 35678:case 36198:case 36298:case 36306:case 35682:return x0;case 35679:case 36299:case 36307:return y0;case 35680:case 36300:case 36308:case 36293:return v0;case 36289:case 36303:case 36311:case 36292:return S0}}function b0(i,t){i.uniform1fv(this.addr,t)}function w0(i,t){let e=qs(t,this.size,2);i.uniform2fv(this.addr,e)}function A0(i,t){let e=qs(t,this.size,3);i.uniform3fv(this.addr,e)}function T0(i,t){let e=qs(t,this.size,4);i.uniform4fv(this.addr,e)}function E0(i,t){let e=qs(t,this.size,4);i.uniformMatrix2fv(this.addr,!1,e)}function C0(i,t){let e=qs(t,this.size,9);i.uniformMatrix3fv(this.addr,!1,e)}function R0(i,t){let e=qs(t,this.size,16);i.uniformMatrix4fv(this.addr,!1,e)}function P0(i,t){i.uniform1iv(this.addr,t)}function I0(i,t){i.uniform2iv(this.addr,t)}function D0(i,t){i.uniform3iv(this.addr,t)}function U0(i,t){i.uniform4iv(this.addr,t)}function L0(i,t){i.uniform1uiv(this.addr,t)}function N0(i,t){i.uniform2uiv(this.addr,t)}function F0(i,t){i.uniform3uiv(this.addr,t)}function O0(i,t){i.uniform4uiv(this.addr,t)}function B0(i,t,e){let n=this.cache,s=t.length,r=sl(e,s);Oe(n,r)||(i.uniform1iv(this.addr,r),Be(n,r));let a;this.type===i.SAMPLER_2D_SHADOW?a=Fc:a=cf;for(let o=0;o!==s;++o)e.setTexture2D(t[o]||a,r[o])}function k0(i,t,e){let n=this.cache,s=t.length,r=sl(e,s);Oe(n,r)||(i.uniform1iv(this.addr,r),Be(n,r));for(let a=0;a!==s;++a)e.setTexture3D(t[a]||uf,r[a])}function z0(i,t,e){let n=this.cache,s=t.length,r=sl(e,s);Oe(n,r)||(i.uniform1iv(this.addr,r),Be(n,r));for(let a=0;a!==s;++a)e.setTextureCube(t[a]||ff,r[a])}function V0(i,t,e){let n=this.cache,s=t.length,r=sl(e,s);Oe(n,r)||(i.uniform1iv(this.addr,r),Be(n,r));for(let a=0;a!==s;++a)e.setTexture2DArray(t[a]||hf,r[a])}function G0(i){switch(i){case 5126:return b0;case 35664:return w0;case 35665:return A0;case 35666:return T0;case 35674:return E0;case 35675:return C0;case 35676:return R0;case 5124:case 35670:return P0;case 35667:case 35671:return I0;case 35668:case 35672:return D0;case 35669:case 35673:return U0;case 5125:return L0;case 36294:return N0;case 36295:return F0;case 36296:return O0;case 35678:case 36198:case 36298:case 36306:case 35682:return B0;case 35679:case 36299:case 36307:return k0;case 35680:case 36300:case 36308:case 36293:return z0;case 36289:case 36303:case 36311:case 36292:return V0}}var Oc=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.setValue=M0(e.type)}},Bc=class{constructor(t,e,n){this.id=t,this.addr=n,this.cache=[],this.type=e.type,this.size=e.size,this.setValue=G0(e.type)}},kc=class{constructor(t){this.id=t,this.seq=[],this.map={}}setValue(t,e,n){let s=this.seq;for(let r=0,a=s.length;r!==a;++r){let o=s[r];o.setValue(t,e[o.id],n)}}},Lc=/(\w+)(\])?(\[|\.)?/g;function Zu(i,t){i.seq.push(t),i.map[t.id]=t}function H0(i,t,e){let n=i.name,s=n.length;for(Lc.lastIndex=0;;){let r=Lc.exec(n),a=Lc.lastIndex,o=r[1],l=r[2]==="]",c=r[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===s){Zu(e,c===void 0?new Oc(o,i,t):new Bc(o,i,t));break}else{let u=e.map[o];u===void 0&&(u=new kc(o),Zu(e,u)),e=u}}}var Xs=class{constructor(t,e){this.seq=[],this.map={};let n=t.getProgramParameter(e,t.ACTIVE_UNIFORMS);for(let a=0;a<n;++a){let o=t.getActiveUniform(e,a),l=t.getUniformLocation(e,o.name);H0(o,l,this)}let s=[],r=[];for(let a of this.seq)a.type===t.SAMPLER_2D_SHADOW||a.type===t.SAMPLER_CUBE_SHADOW||a.type===t.SAMPLER_2D_ARRAY_SHADOW?s.push(a):r.push(a);s.length>0&&(this.seq=s.concat(r))}setValue(t,e,n,s){let r=this.map[e];r!==void 0&&r.setValue(t,n,s)}setOptional(t,e,n){let s=e[n];s!==void 0&&this.setValue(t,n,s)}static upload(t,e,n,s){for(let r=0,a=e.length;r!==a;++r){let o=e[r],l=n[o.id];l.needsUpdate!==!1&&o.setValue(t,l.value,s)}}static seqWithValue(t,e){let n=[];for(let s=0,r=t.length;s!==r;++s){let a=t[s];a.id in e&&n.push(a)}return n}};function Ju(i,t,e){let n=i.createShader(t);return i.shaderSource(n,e),i.compileShader(n),n}var W0=37297,X0=0;function q0(i,t){let e=i.split(`
`),n=[],s=Math.max(t-6,0),r=Math.min(t+6,e.length);for(let a=s;a<r;a++){let o=a+1;n.push(`${o===t?">":" "} ${o}: ${e[a]}`)}return n.join(`
`)}var Ku=new ne;function Y0(i){ce._getMatrix(Ku,ce.workingColorSpace,i);let t=`mat3( ${Ku.elements.map(e=>e.toFixed(4))} )`;switch(ce.getTransfer(i)){case hr:return[t,"LinearTransferOETF"];case me:return[t,"sRGBTransferOETF"];default:return Jt("WebGLProgram: Unsupported color space: ",i),[t,"LinearTransferOETF"]}}function $u(i,t,e){let n=i.getShaderParameter(t,i.COMPILE_STATUS),r=(i.getShaderInfoLog(t)||"").trim();if(n&&r==="")return"";let a=/ERROR: 0:(\d+)/.exec(r);if(a){let o=parseInt(a[1]);return e.toUpperCase()+`

`+r+`

`+q0(i.getShaderSource(t),o)}else return r}function Z0(i,t){let e=Y0(t);return[`vec4 ${i}( vec4 value ) {`,`	return ${e[1]}( vec4( value.rgb * ${e[0]}, value.a ) );`,"}"].join(`
`)}var J0={[sc]:"Linear",[rc]:"Reinhard",[ac]:"Cineon",[uo]:"ACESFilmic",[lc]:"AgX",[cc]:"Neutral",[oc]:"Custom"};function K0(i,t){let e=J0[t];return e===void 0?(Jt("WebGLProgram: Unsupported toneMapping:",t),"vec3 "+i+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+i+"( vec3 color ) { return "+e+"ToneMapping( color ); }"}var el=new H;function $0(){ce.getLuminanceCoefficients(el);let i=el.x.toFixed(4),t=el.y.toFixed(4),e=el.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${i}, ${t}, ${e} );`,"	return dot( weights, rgb );","}"].join(`
`)}function j0(i){return[i.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",i.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Kr).join(`
`)}function Q0(i){let t=[];for(let e in i){let n=i[e];n!==!1&&t.push("#define "+e+" "+n)}return t.join(`
`)}function t_(i,t){let e={},n=i.getProgramParameter(t,i.ACTIVE_ATTRIBUTES);for(let s=0;s<n;s++){let r=i.getActiveAttrib(t,s),a=r.name,o=1;r.type===i.FLOAT_MAT2&&(o=2),r.type===i.FLOAT_MAT3&&(o=3),r.type===i.FLOAT_MAT4&&(o=4),e[a]={type:r.type,location:i.getAttribLocation(t,a),locationSize:o}}return e}function Kr(i){return i!==""}function ju(i,t){let e=t.numSpotLightShadows+t.numSpotLightMaps-t.numSpotLightShadowsWithMaps;return i.replace(/NUM_DIR_LIGHTS/g,t.numDirLights).replace(/NUM_SPOT_LIGHTS/g,t.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,t.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,e).replace(/NUM_RECT_AREA_LIGHTS/g,t.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,t.numPointLights).replace(/NUM_HEMI_LIGHTS/g,t.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,t.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,t.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,t.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,t.numPointLightShadows)}function Qu(i,t){return i.replace(/NUM_CLIPPING_PLANES/g,t.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,t.numClippingPlanes-t.numClipIntersection)}var e_=/^[ \t]*#include +<([\w\d./]+)>/gm;function zc(i){return i.replace(e_,i_)}var n_=new Map;function i_(i,t){let e=oe[t];if(e===void 0){let n=n_.get(t);if(n!==void 0)e=oe[n],Jt('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',t,n);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+t+">")}return zc(e)}var s_=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function tf(i){return i.replace(s_,r_)}function r_(i,t,e,n){let s="";for(let r=parseInt(t);r<parseInt(e);r++)s+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function ef(i){let t=`precision ${i.precision} float;
	precision ${i.precision} int;
	precision ${i.precision} sampler2D;
	precision ${i.precision} samplerCube;
	precision ${i.precision} sampler3D;
	precision ${i.precision} sampler2DArray;
	precision ${i.precision} sampler2DShadow;
	precision ${i.precision} samplerCubeShadow;
	precision ${i.precision} sampler2DArrayShadow;
	precision ${i.precision} isampler2D;
	precision ${i.precision} isampler3D;
	precision ${i.precision} isamplerCube;
	precision ${i.precision} isampler2DArray;
	precision ${i.precision} usampler2D;
	precision ${i.precision} usampler3D;
	precision ${i.precision} usamplerCube;
	precision ${i.precision} usampler2DArray;
	`;return i.precision==="highp"?t+=`
#define HIGH_PRECISION`:i.precision==="mediump"?t+=`
#define MEDIUM_PRECISION`:i.precision==="lowp"&&(t+=`
#define LOW_PRECISION`),t}var a_={[Br]:"SHADOWMAP_TYPE_PCF",[Vs]:"SHADOWMAP_TYPE_VSM"};function o_(i){return a_[i.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}var l_={[Ri]:"ENVMAP_TYPE_CUBE",[Qi]:"ENVMAP_TYPE_CUBE",[kr]:"ENVMAP_TYPE_CUBE_UV"};function c_(i){return i.envMap===!1?"ENVMAP_TYPE_CUBE":l_[i.envMapMode]||"ENVMAP_TYPE_CUBE"}var h_={[Qi]:"ENVMAP_MODE_REFRACTION"};function u_(i){return i.envMap===!1?"ENVMAP_MODE_REFLECTION":h_[i.envMapMode]||"ENVMAP_MODE_REFLECTION"}var f_={[ho]:"ENVMAP_BLENDING_MULTIPLY",[pu]:"ENVMAP_BLENDING_MIX",[mu]:"ENVMAP_BLENDING_ADD"};function d_(i){return i.envMap===!1?"ENVMAP_BLENDING_NONE":f_[i.combine]||"ENVMAP_BLENDING_NONE"}function p_(i){let t=i.envMapCubeUVHeight;if(t===null)return null;let e=Math.log2(t)-2,n=1/t;return{texelWidth:1/(3*Math.max(Math.pow(2,e),112)),texelHeight:n,maxMip:e}}function m_(i,t,e,n){let s=i.getContext(),r=e.defines,a=e.vertexShader,o=e.fragmentShader,l=o_(e),c=c_(e),f=u_(e),u=d_(e),d=p_(e),p=j0(e),g=Q0(r),y=s.createProgram(),m,_,R=e.glslVersion?"#version "+e.glslVersion+`
`:"";e.isRawShaderMaterial?(m=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Kr).join(`
`),m.length>0&&(m+=`
`),_=["#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g].filter(Kr).join(`
`),_.length>0&&(_+=`
`)):(m=[ef(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",e.batching?"#define USE_BATCHING":"",e.batchingColor?"#define USE_BATCHING_COLOR":"",e.instancing?"#define USE_INSTANCING":"",e.instancingColor?"#define USE_INSTANCING_COLOR":"",e.instancingMorph?"#define USE_INSTANCING_MORPH":"",e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.map?"#define USE_MAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+f:"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.displacementMap?"#define USE_DISPLACEMENTMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.mapUv?"#define MAP_UV "+e.mapUv:"",e.alphaMapUv?"#define ALPHAMAP_UV "+e.alphaMapUv:"",e.lightMapUv?"#define LIGHTMAP_UV "+e.lightMapUv:"",e.aoMapUv?"#define AOMAP_UV "+e.aoMapUv:"",e.emissiveMapUv?"#define EMISSIVEMAP_UV "+e.emissiveMapUv:"",e.bumpMapUv?"#define BUMPMAP_UV "+e.bumpMapUv:"",e.normalMapUv?"#define NORMALMAP_UV "+e.normalMapUv:"",e.displacementMapUv?"#define DISPLACEMENTMAP_UV "+e.displacementMapUv:"",e.metalnessMapUv?"#define METALNESSMAP_UV "+e.metalnessMapUv:"",e.roughnessMapUv?"#define ROUGHNESSMAP_UV "+e.roughnessMapUv:"",e.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+e.anisotropyMapUv:"",e.clearcoatMapUv?"#define CLEARCOATMAP_UV "+e.clearcoatMapUv:"",e.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+e.clearcoatNormalMapUv:"",e.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+e.clearcoatRoughnessMapUv:"",e.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+e.iridescenceMapUv:"",e.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+e.iridescenceThicknessMapUv:"",e.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+e.sheenColorMapUv:"",e.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+e.sheenRoughnessMapUv:"",e.specularMapUv?"#define SPECULARMAP_UV "+e.specularMapUv:"",e.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+e.specularColorMapUv:"",e.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+e.specularIntensityMapUv:"",e.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+e.transmissionMapUv:"",e.thicknessMapUv?"#define THICKNESSMAP_UV "+e.thicknessMapUv:"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexNormals?"#define HAS_NORMAL":"",e.vertexColors?"#define USE_COLOR":"",e.vertexAlphas?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.flatShading?"#define FLAT_SHADED":"",e.skinning?"#define USE_SKINNING":"",e.morphTargets?"#define USE_MORPHTARGETS":"",e.morphNormals&&e.flatShading===!1?"#define USE_MORPHNORMALS":"",e.morphColors?"#define USE_MORPHCOLORS":"",e.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+e.morphTextureStride:"",e.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+e.morphTargetsCount:"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.sizeAttenuation?"#define USE_SIZEATTENUATION":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Kr).join(`
`),_=[ef(e),"#define SHADER_TYPE "+e.shaderType,"#define SHADER_NAME "+e.shaderName,g,e.useFog&&e.fog?"#define USE_FOG":"",e.useFog&&e.fogExp2?"#define FOG_EXP2":"",e.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",e.map?"#define USE_MAP":"",e.matcap?"#define USE_MATCAP":"",e.envMap?"#define USE_ENVMAP":"",e.envMap?"#define "+c:"",e.envMap?"#define "+f:"",e.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",e.lightMap?"#define USE_LIGHTMAP":"",e.aoMap?"#define USE_AOMAP":"",e.bumpMap?"#define USE_BUMPMAP":"",e.normalMap?"#define USE_NORMALMAP":"",e.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",e.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",e.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",e.emissiveMap?"#define USE_EMISSIVEMAP":"",e.anisotropy?"#define USE_ANISOTROPY":"",e.anisotropyMap?"#define USE_ANISOTROPYMAP":"",e.clearcoat?"#define USE_CLEARCOAT":"",e.clearcoatMap?"#define USE_CLEARCOATMAP":"",e.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",e.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",e.dispersion?"#define USE_DISPERSION":"",e.iridescence?"#define USE_IRIDESCENCE":"",e.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",e.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",e.specularMap?"#define USE_SPECULARMAP":"",e.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",e.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",e.roughnessMap?"#define USE_ROUGHNESSMAP":"",e.metalnessMap?"#define USE_METALNESSMAP":"",e.alphaMap?"#define USE_ALPHAMAP":"",e.alphaTest?"#define USE_ALPHATEST":"",e.alphaHash?"#define USE_ALPHAHASH":"",e.sheen?"#define USE_SHEEN":"",e.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",e.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",e.transmission?"#define USE_TRANSMISSION":"",e.transmissionMap?"#define USE_TRANSMISSIONMAP":"",e.thicknessMap?"#define USE_THICKNESSMAP":"",e.vertexTangents&&e.flatShading===!1?"#define USE_TANGENT":"",e.vertexColors||e.instancingColor?"#define USE_COLOR":"",e.vertexAlphas||e.batchingColor?"#define USE_COLOR_ALPHA":"",e.vertexUv1s?"#define USE_UV1":"",e.vertexUv2s?"#define USE_UV2":"",e.vertexUv3s?"#define USE_UV3":"",e.pointsUvs?"#define USE_POINTS_UV":"",e.gradientMap?"#define USE_GRADIENTMAP":"",e.flatShading?"#define FLAT_SHADED":"",e.doubleSided?"#define DOUBLE_SIDED":"",e.flipSided?"#define FLIP_SIDED":"",e.shadowMapEnabled?"#define USE_SHADOWMAP":"",e.shadowMapEnabled?"#define "+l:"",e.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",e.numLightProbes>0?"#define USE_LIGHT_PROBES":"",e.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",e.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",e.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",e.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",e.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",e.toneMapping!==Dn?"#define TONE_MAPPING":"",e.toneMapping!==Dn?oe.tonemapping_pars_fragment:"",e.toneMapping!==Dn?K0("toneMapping",e.toneMapping):"",e.dithering?"#define DITHERING":"",e.opaque?"#define OPAQUE":"",oe.colorspace_pars_fragment,Z0("linearToOutputTexel",e.outputColorSpace),$0(),e.useDepthPacking?"#define DEPTH_PACKING "+e.depthPacking:"",`
`].filter(Kr).join(`
`)),a=zc(a),a=ju(a,e),a=Qu(a,e),o=zc(o),o=ju(o,e),o=Qu(o,e),a=tf(a),o=tf(o),e.isRawShaderMaterial!==!0&&(R=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,_=["#define varying in",e.glslVersion===_c?"":"layout(location = 0) out highp vec4 pc_fragColor;",e.glslVersion===_c?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+_);let w=R+m+a,v=R+_+o,E=Ju(s,s.VERTEX_SHADER,w),C=Ju(s,s.FRAGMENT_SHADER,v);s.attachShader(y,E),s.attachShader(y,C),e.index0AttributeName!==void 0?s.bindAttribLocation(y,0,e.index0AttributeName):e.hasPositionAttribute===!0&&s.bindAttribLocation(y,0,"position"),s.linkProgram(y);function D(N){if(i.debug.checkShaderErrors){let F=s.getProgramInfoLog(y)||"",Y=s.getShaderInfoLog(E)||"",J=s.getShaderInfoLog(C)||"",O=F.trim(),K=Y.trim(),Z=J.trim(),st=!0,lt=!0;if(s.getProgramParameter(y,s.LINK_STATUS)===!1)if(st=!1,typeof i.debug.onShaderError=="function")i.debug.onShaderError(s,y,E,C);else{let St=$u(s,E,"vertex"),mt=$u(s,C,"fragment");jt("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(y,s.VALIDATE_STATUS)+`

Material Name: `+N.name+`
Material Type: `+N.type+`

Program Info Log: `+O+`
`+St+`
`+mt)}else O!==""?Jt("WebGLProgram: Program Info Log:",O):(K===""||Z==="")&&(lt=!1);lt&&(N.diagnostics={runnable:st,programLog:O,vertexShader:{log:K,prefix:m},fragmentShader:{log:Z,prefix:_}})}s.deleteShader(E),s.deleteShader(C),S=new Xs(s,y),T=t_(s,y)}let S;this.getUniforms=function(){return S===void 0&&D(this),S};let T;this.getAttributes=function(){return T===void 0&&D(this),T};let L=e.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return L===!1&&(L=s.getProgramParameter(y,W0)),L},this.destroy=function(){n.releaseStatesOfProgram(this),s.deleteProgram(y),this.program=void 0},this.type=e.shaderType,this.name=e.shaderName,this.id=X0++,this.cacheKey=t,this.usedTimes=1,this.program=y,this.vertexShader=E,this.fragmentShader=C,this}var g_=0,Vc=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(t,e,n){let s=this._getShaderCacheForMaterial(t);return s.has(e)===!1&&(s.add(e),e.usedTimes++),s.has(n)===!1&&(s.add(n),n.usedTimes++),this}remove(t){let e=this.materialCache.get(t);for(let n of e)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(t),this}getVertexShaderStage(t){return this._getShaderStage(t.vertexShader)}getFragmentShaderStage(t){return this._getShaderStage(t.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(t){let e=this.materialCache,n=e.get(t);return n===void 0&&(n=new Set,e.set(t,n)),n}_getShaderStage(t){let e=this.shaderCache,n=e.get(t);return n===void 0&&(n=new Gc(t),e.set(t,n)),n}},Gc=class{constructor(t){this.id=g_++,this.code=t,this.usedTimes=0}};function __(i){return i===cn||i===Xr||i===qr}function x_(i,t,e,n,s,r){let a=new dr,o=new Vc,l=new Set,c=[],f=new Map,u=n.logarithmicDepthBuffer,d=n.precision,p={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function g(S){return l.add(S),S===0?"uv":`uv${S}`}function y(S,T,L,N,F,Y){let J=N.fog,O=F.geometry,K=S.isMeshStandardMaterial||S.isMeshLambertMaterial||S.isMeshPhongMaterial?N.environment:null,Z=S.isMeshStandardMaterial||S.isMeshLambertMaterial&&!S.envMap||S.isMeshPhongMaterial&&!S.envMap,st=t.get(S.envMap||K,Z),lt=st&&st.mapping===kr?st.image.height:null,St=p[S.type];S.precision!==null&&(d=n.getMaxPrecision(S.precision),d!==S.precision&&Jt("WebGLProgram.getParameters:",S.precision,"not supported, using",d,"instead."));let mt=O.morphAttributes.position||O.morphAttributes.normal||O.morphAttributes.color,vt=mt!==void 0?mt.length:0,qt=0;O.morphAttributes.position!==void 0&&(qt=1),O.morphAttributes.normal!==void 0&&(qt=2),O.morphAttributes.color!==void 0&&(qt=3);let Qt,kt,tt,ot;if(St){let Gt=Yn[St];Qt=Gt.vertexShader,kt=Gt.fragmentShader}else{Qt=S.vertexShader,kt=S.fragmentShader;let Gt=o.getVertexShaderStage(S),be=o.getFragmentShaderStage(S);o.update(S,Gt,be),tt=Gt.id,ot=be.id}let ht=i.getRenderTarget(),gt=i.state.buffers.depth.getReversed(),Nt=F.isInstancedMesh===!0,Lt=F.isBatchedMesh===!0,re=!!S.map,Dt=!!S.matcap,$t=!!st,Zt=!!S.aoMap,le=!!S.lightMap,Ce=!!S.bumpMap&&S.wireframe===!1,Ie=!!S.normalMap,De=!!S.displacementMap,Ne=!!S.emissiveMap,Se=!!S.metalnessMap,Re=!!S.roughnessMap,V=S.anisotropy>0,Ke=S.clearcoat>0,ue=S.dispersion>0,U=S.iridescence>0,b=S.sheen>0,X=S.transmission>0,j=V&&!!S.anisotropyMap,et=Ke&&!!S.clearcoatMap,yt=Ke&&!!S.clearcoatNormalMap,Mt=Ke&&!!S.clearcoatRoughnessMap,it=U&&!!S.iridescenceMap,at=U&&!!S.iridescenceThicknessMap,At=b&&!!S.sheenColorMap,Ut=b&&!!S.sheenRoughnessMap,xt=!!S.specularMap,wt=!!S.specularColorMap,Vt=!!S.specularIntensityMap,Ft=X&&!!S.transmissionMap,Yt=X&&!!S.thicknessMap,B=!!S.gradientMap,Q=!!S.alphaMap,rt=S.alphaTest>0,Tt=!!S.alphaHash,Rt=!!S.extensions,ut=Dn;S.toneMapped&&(ht===null||ht.isXRRenderTarget===!0)&&(ut=i.toneMapping);let Wt={shaderID:St,shaderType:S.type,shaderName:S.name,vertexShader:Qt,fragmentShader:kt,defines:S.defines,customVertexShaderID:tt,customFragmentShaderID:ot,isRawShaderMaterial:S.isRawShaderMaterial===!0,glslVersion:S.glslVersion,precision:d,batching:Lt,batchingColor:Lt&&F._colorsTexture!==null,instancing:Nt,instancingColor:Nt&&F.instanceColor!==null,instancingMorph:Nt&&F.morphTexture!==null,outputColorSpace:ht===null?i.outputColorSpace:ht.isXRRenderTarget===!0?ht.texture.colorSpace:ce.workingColorSpace,alphaToCoverage:!!S.alphaToCoverage,map:re,matcap:Dt,envMap:$t,envMapMode:$t&&st.mapping,envMapCubeUVHeight:lt,aoMap:Zt,lightMap:le,bumpMap:Ce,normalMap:Ie,displacementMap:De,emissiveMap:Ne,normalMapObjectSpace:Ie&&S.normalMapType===vu,normalMapTangentSpace:Ie&&S.normalMapType===Yr,packedNormalMap:Ie&&S.normalMapType===Yr&&__(S.normalMap.format),metalnessMap:Se,roughnessMap:Re,anisotropy:V,anisotropyMap:j,clearcoat:Ke,clearcoatMap:et,clearcoatNormalMap:yt,clearcoatRoughnessMap:Mt,dispersion:ue,iridescence:U,iridescenceMap:it,iridescenceThicknessMap:at,sheen:b,sheenColorMap:At,sheenRoughnessMap:Ut,specularMap:xt,specularColorMap:wt,specularIntensityMap:Vt,transmission:X,transmissionMap:Ft,thicknessMap:Yt,gradientMap:B,opaque:S.transparent===!1&&S.blending===Gi&&S.alphaToCoverage===!1,alphaMap:Q,alphaTest:rt,alphaHash:Tt,combine:S.combine,mapUv:re&&g(S.map.channel),aoMapUv:Zt&&g(S.aoMap.channel),lightMapUv:le&&g(S.lightMap.channel),bumpMapUv:Ce&&g(S.bumpMap.channel),normalMapUv:Ie&&g(S.normalMap.channel),displacementMapUv:De&&g(S.displacementMap.channel),emissiveMapUv:Ne&&g(S.emissiveMap.channel),metalnessMapUv:Se&&g(S.metalnessMap.channel),roughnessMapUv:Re&&g(S.roughnessMap.channel),anisotropyMapUv:j&&g(S.anisotropyMap.channel),clearcoatMapUv:et&&g(S.clearcoatMap.channel),clearcoatNormalMapUv:yt&&g(S.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Mt&&g(S.clearcoatRoughnessMap.channel),iridescenceMapUv:it&&g(S.iridescenceMap.channel),iridescenceThicknessMapUv:at&&g(S.iridescenceThicknessMap.channel),sheenColorMapUv:At&&g(S.sheenColorMap.channel),sheenRoughnessMapUv:Ut&&g(S.sheenRoughnessMap.channel),specularMapUv:xt&&g(S.specularMap.channel),specularColorMapUv:wt&&g(S.specularColorMap.channel),specularIntensityMapUv:Vt&&g(S.specularIntensityMap.channel),transmissionMapUv:Ft&&g(S.transmissionMap.channel),thicknessMapUv:Yt&&g(S.thicknessMap.channel),alphaMapUv:Q&&g(S.alphaMap.channel),vertexTangents:!!O.attributes.tangent&&(Ie||V),vertexNormals:!!O.attributes.normal,vertexColors:S.vertexColors,vertexAlphas:S.vertexColors===!0&&!!O.attributes.color&&O.attributes.color.itemSize===4,pointsUvs:F.isPoints===!0&&!!O.attributes.uv&&(re||Q),fog:!!J,useFog:S.fog===!0,fogExp2:!!J&&J.isFogExp2,flatShading:S.wireframe===!1&&(S.flatShading===!0||O.attributes.normal===void 0&&Ie===!1&&(S.isMeshLambertMaterial||S.isMeshPhongMaterial||S.isMeshStandardMaterial||S.isMeshPhysicalMaterial)),sizeAttenuation:S.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:gt,skinning:F.isSkinnedMesh===!0,hasPositionAttribute:O.attributes.position!==void 0,morphTargets:O.morphAttributes.position!==void 0,morphNormals:O.morphAttributes.normal!==void 0,morphColors:O.morphAttributes.color!==void 0,morphTargetsCount:vt,morphTextureStride:qt,numDirLights:T.directional.length,numPointLights:T.point.length,numSpotLights:T.spot.length,numSpotLightMaps:T.spotLightMap.length,numRectAreaLights:T.rectArea.length,numHemiLights:T.hemi.length,numDirLightShadows:T.directionalShadowMap.length,numPointLightShadows:T.pointShadowMap.length,numSpotLightShadows:T.spotShadowMap.length,numSpotLightShadowsWithMaps:T.numSpotLightShadowsWithMaps,numLightProbes:T.numLightProbes,numLightProbeGrids:Y.length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:S.dithering,shadowMapEnabled:i.shadowMap.enabled&&L.length>0,shadowMapType:i.shadowMap.type,toneMapping:ut,decodeVideoTexture:re&&S.map.isVideoTexture===!0&&ce.getTransfer(S.map.colorSpace)===me,decodeVideoTextureEmissive:Ne&&S.emissiveMap.isVideoTexture===!0&&ce.getTransfer(S.emissiveMap.colorSpace)===me,premultipliedAlpha:S.premultipliedAlpha,doubleSided:S.side===Wn,flipSided:S.side===Xe,useDepthPacking:S.depthPacking>=0,depthPacking:S.depthPacking||0,index0AttributeName:S.index0AttributeName,extensionClipCullDistance:Rt&&S.extensions.clipCullDistance===!0&&e.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Rt&&S.extensions.multiDraw===!0||Lt)&&e.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:e.has("KHR_parallel_shader_compile"),customProgramCacheKey:S.customProgramCacheKey()};return Wt.vertexUv1s=l.has(1),Wt.vertexUv2s=l.has(2),Wt.vertexUv3s=l.has(3),l.clear(),Wt}function m(S){let T=[];if(S.shaderID?T.push(S.shaderID):(T.push(S.customVertexShaderID),T.push(S.customFragmentShaderID)),S.defines!==void 0)for(let L in S.defines)T.push(L),T.push(S.defines[L]);return S.isRawShaderMaterial===!1&&(_(T,S),R(T,S),T.push(i.outputColorSpace)),T.push(S.customProgramCacheKey),T.join()}function _(S,T){S.push(T.precision),S.push(T.outputColorSpace),S.push(T.envMapMode),S.push(T.envMapCubeUVHeight),S.push(T.mapUv),S.push(T.alphaMapUv),S.push(T.lightMapUv),S.push(T.aoMapUv),S.push(T.bumpMapUv),S.push(T.normalMapUv),S.push(T.displacementMapUv),S.push(T.emissiveMapUv),S.push(T.metalnessMapUv),S.push(T.roughnessMapUv),S.push(T.anisotropyMapUv),S.push(T.clearcoatMapUv),S.push(T.clearcoatNormalMapUv),S.push(T.clearcoatRoughnessMapUv),S.push(T.iridescenceMapUv),S.push(T.iridescenceThicknessMapUv),S.push(T.sheenColorMapUv),S.push(T.sheenRoughnessMapUv),S.push(T.specularMapUv),S.push(T.specularColorMapUv),S.push(T.specularIntensityMapUv),S.push(T.transmissionMapUv),S.push(T.thicknessMapUv),S.push(T.combine),S.push(T.fogExp2),S.push(T.sizeAttenuation),S.push(T.morphTargetsCount),S.push(T.morphAttributeCount),S.push(T.numDirLights),S.push(T.numPointLights),S.push(T.numSpotLights),S.push(T.numSpotLightMaps),S.push(T.numHemiLights),S.push(T.numRectAreaLights),S.push(T.numDirLightShadows),S.push(T.numPointLightShadows),S.push(T.numSpotLightShadows),S.push(T.numSpotLightShadowsWithMaps),S.push(T.numLightProbes),S.push(T.shadowMapType),S.push(T.toneMapping),S.push(T.numClippingPlanes),S.push(T.numClipIntersection),S.push(T.depthPacking)}function R(S,T){a.disableAll(),T.instancing&&a.enable(0),T.instancingColor&&a.enable(1),T.instancingMorph&&a.enable(2),T.matcap&&a.enable(3),T.envMap&&a.enable(4),T.normalMapObjectSpace&&a.enable(5),T.normalMapTangentSpace&&a.enable(6),T.clearcoat&&a.enable(7),T.iridescence&&a.enable(8),T.alphaTest&&a.enable(9),T.vertexColors&&a.enable(10),T.vertexAlphas&&a.enable(11),T.vertexUv1s&&a.enable(12),T.vertexUv2s&&a.enable(13),T.vertexUv3s&&a.enable(14),T.vertexTangents&&a.enable(15),T.anisotropy&&a.enable(16),T.alphaHash&&a.enable(17),T.batching&&a.enable(18),T.dispersion&&a.enable(19),T.batchingColor&&a.enable(20),T.gradientMap&&a.enable(21),T.packedNormalMap&&a.enable(22),T.vertexNormals&&a.enable(23),S.push(a.mask),a.disableAll(),T.fog&&a.enable(0),T.useFog&&a.enable(1),T.flatShading&&a.enable(2),T.logarithmicDepthBuffer&&a.enable(3),T.reversedDepthBuffer&&a.enable(4),T.skinning&&a.enable(5),T.morphTargets&&a.enable(6),T.morphNormals&&a.enable(7),T.morphColors&&a.enable(8),T.premultipliedAlpha&&a.enable(9),T.shadowMapEnabled&&a.enable(10),T.doubleSided&&a.enable(11),T.flipSided&&a.enable(12),T.useDepthPacking&&a.enable(13),T.dithering&&a.enable(14),T.transmission&&a.enable(15),T.sheen&&a.enable(16),T.opaque&&a.enable(17),T.pointsUvs&&a.enable(18),T.decodeVideoTexture&&a.enable(19),T.decodeVideoTextureEmissive&&a.enable(20),T.alphaToCoverage&&a.enable(21),T.numLightProbeGrids>0&&a.enable(22),T.hasPositionAttribute&&a.enable(23),S.push(a.mask)}function w(S){let T=p[S.type],L;if(T){let N=Yn[T];L=Fu.clone(N.uniforms)}else L=S.uniforms;return L}function v(S,T){let L=f.get(T);return L!==void 0?++L.usedTimes:(L=new m_(i,T,S,s),c.push(L),f.set(T,L)),L}function E(S){if(--S.usedTimes===0){let T=c.indexOf(S);c[T]=c[c.length-1],c.pop(),f.delete(S.cacheKey),S.destroy()}}function C(S){o.remove(S)}function D(){o.dispose()}return{getParameters:y,getProgramCacheKey:m,getUniforms:w,acquireProgram:v,releaseProgram:E,releaseShaderCache:C,programs:c,dispose:D}}function y_(){let i=new WeakMap;function t(a){return i.has(a)}function e(a){let o=i.get(a);return o===void 0&&(o={},i.set(a,o)),o}function n(a){i.delete(a)}function s(a,o,l){i.get(a)[o]=l}function r(){i=new WeakMap}return{has:t,get:e,remove:n,update:s,dispose:r}}function v_(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.material.id!==t.material.id?i.material.id-t.material.id:i.materialVariant!==t.materialVariant?i.materialVariant-t.materialVariant:i.z!==t.z?i.z-t.z:i.id-t.id}function nf(i,t){return i.groupOrder!==t.groupOrder?i.groupOrder-t.groupOrder:i.renderOrder!==t.renderOrder?i.renderOrder-t.renderOrder:i.z!==t.z?t.z-i.z:i.id-t.id}function sf(){let i=[],t=0,e=[],n=[],s=[];function r(){t=0,e.length=0,n.length=0,s.length=0}function a(d){let p=0;return d.isInstancedMesh&&(p+=2),d.isSkinnedMesh&&(p+=1),p}function o(d,p,g,y,m,_){let R=i[t];return R===void 0?(R={id:d.id,object:d,geometry:p,material:g,materialVariant:a(d),groupOrder:y,renderOrder:d.renderOrder,z:m,group:_},i[t]=R):(R.id=d.id,R.object=d,R.geometry=p,R.material=g,R.materialVariant=a(d),R.groupOrder=y,R.renderOrder=d.renderOrder,R.z=m,R.group=_),t++,R}function l(d,p,g,y,m,_){let R=o(d,p,g,y,m,_);g.transmission>0?n.push(R):g.transparent===!0?s.push(R):e.push(R)}function c(d,p,g,y,m,_){let R=o(d,p,g,y,m,_);g.transmission>0?n.unshift(R):g.transparent===!0?s.unshift(R):e.unshift(R)}function f(d,p,g){e.length>1&&e.sort(d||v_),n.length>1&&n.sort(p||nf),s.length>1&&s.sort(p||nf),g&&(e.reverse(),n.reverse(),s.reverse())}function u(){for(let d=t,p=i.length;d<p;d++){let g=i[d];if(g.id===null)break;g.id=null,g.object=null,g.geometry=null,g.material=null,g.group=null}}return{opaque:e,transmissive:n,transparent:s,init:r,push:l,unshift:c,finish:u,sort:f}}function S_(){let i=new WeakMap;function t(n,s){let r=i.get(n),a;return r===void 0?(a=new sf,i.set(n,[a])):s>=r.length?(a=new sf,r.push(a)):a=r[s],a}function e(){i=new WeakMap}return{get:t,dispose:e}}function M_(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={direction:new H,color:new ie};break;case"SpotLight":e={position:new H,direction:new H,color:new ie,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":e={position:new H,color:new ie,distance:0,decay:0};break;case"HemisphereLight":e={direction:new H,skyColor:new ie,groundColor:new ie};break;case"RectAreaLight":e={color:new ie,position:new H,halfWidth:new H,halfHeight:new H};break}return i[t.id]=e,e}}}function b_(){let i={};return{get:function(t){if(i[t.id]!==void 0)return i[t.id];let e;switch(t.type){case"DirectionalLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Kt};break;case"SpotLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Kt};break;case"PointLight":e={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Kt,shadowCameraNear:1,shadowCameraFar:1e3};break}return i[t.id]=e,e}}}var w_=0;function A_(i,t){return(t.castShadow?2:0)-(i.castShadow?2:0)+(t.map?1:0)-(i.map?1:0)}function T_(i){let t=new M_,e=b_(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)n.probe.push(new H);let s=new H,r=new se,a=new se;function o(c){let f=0,u=0,d=0;for(let T=0;T<9;T++)n.probe[T].set(0,0,0);let p=0,g=0,y=0,m=0,_=0,R=0,w=0,v=0,E=0,C=0,D=0;c.sort(A_);for(let T=0,L=c.length;T<L;T++){let N=c[T],F=N.color,Y=N.intensity,J=N.distance,O=null;if(N.shadow&&N.shadow.map&&(N.shadow.map.texture.format===cn?O=N.shadow.map.texture:O=N.shadow.map.depthTexture||N.shadow.map.texture),N.isAmbientLight)f+=F.r*Y,u+=F.g*Y,d+=F.b*Y;else if(N.isLightProbe){for(let K=0;K<9;K++)n.probe[K].addScaledVector(N.sh.coefficients[K],Y);D++}else if(N.isDirectionalLight){let K=t.get(N);if(K.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){let Z=N.shadow,st=e.get(N);st.shadowIntensity=Z.intensity,st.shadowBias=Z.bias,st.shadowNormalBias=Z.normalBias,st.shadowRadius=Z.radius,st.shadowMapSize=Z.mapSize,n.directionalShadow[p]=st,n.directionalShadowMap[p]=O,n.directionalShadowMatrix[p]=N.shadow.matrix,R++}n.directional[p]=K,p++}else if(N.isSpotLight){let K=t.get(N);K.position.setFromMatrixPosition(N.matrixWorld),K.color.copy(F).multiplyScalar(Y),K.distance=J,K.coneCos=Math.cos(N.angle),K.penumbraCos=Math.cos(N.angle*(1-N.penumbra)),K.decay=N.decay,n.spot[y]=K;let Z=N.shadow;if(N.map&&(n.spotLightMap[E]=N.map,E++,Z.updateMatrices(N),N.castShadow&&C++),n.spotLightMatrix[y]=Z.matrix,N.castShadow){let st=e.get(N);st.shadowIntensity=Z.intensity,st.shadowBias=Z.bias,st.shadowNormalBias=Z.normalBias,st.shadowRadius=Z.radius,st.shadowMapSize=Z.mapSize,n.spotShadow[y]=st,n.spotShadowMap[y]=O,v++}y++}else if(N.isRectAreaLight){let K=t.get(N);K.color.copy(F).multiplyScalar(Y),K.halfWidth.set(N.width*.5,0,0),K.halfHeight.set(0,N.height*.5,0),n.rectArea[m]=K,m++}else if(N.isPointLight){let K=t.get(N);if(K.color.copy(N.color).multiplyScalar(N.intensity),K.distance=N.distance,K.decay=N.decay,N.castShadow){let Z=N.shadow,st=e.get(N);st.shadowIntensity=Z.intensity,st.shadowBias=Z.bias,st.shadowNormalBias=Z.normalBias,st.shadowRadius=Z.radius,st.shadowMapSize=Z.mapSize,st.shadowCameraNear=Z.camera.near,st.shadowCameraFar=Z.camera.far,n.pointShadow[g]=st,n.pointShadowMap[g]=O,n.pointShadowMatrix[g]=N.shadow.matrix,w++}n.point[g]=K,g++}else if(N.isHemisphereLight){let K=t.get(N);K.skyColor.copy(N.color).multiplyScalar(Y),K.groundColor.copy(N.groundColor).multiplyScalar(Y),n.hemi[_]=K,_++}}m>0&&(i.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=Et.LTC_FLOAT_1,n.rectAreaLTC2=Et.LTC_FLOAT_2):(n.rectAreaLTC1=Et.LTC_HALF_1,n.rectAreaLTC2=Et.LTC_HALF_2)),n.ambient[0]=f,n.ambient[1]=u,n.ambient[2]=d;let S=n.hash;(S.directionalLength!==p||S.pointLength!==g||S.spotLength!==y||S.rectAreaLength!==m||S.hemiLength!==_||S.numDirectionalShadows!==R||S.numPointShadows!==w||S.numSpotShadows!==v||S.numSpotMaps!==E||S.numLightProbes!==D)&&(n.directional.length=p,n.spot.length=y,n.rectArea.length=m,n.point.length=g,n.hemi.length=_,n.directionalShadow.length=R,n.directionalShadowMap.length=R,n.pointShadow.length=w,n.pointShadowMap.length=w,n.spotShadow.length=v,n.spotShadowMap.length=v,n.directionalShadowMatrix.length=R,n.pointShadowMatrix.length=w,n.spotLightMatrix.length=v+E-C,n.spotLightMap.length=E,n.numSpotLightShadowsWithMaps=C,n.numLightProbes=D,S.directionalLength=p,S.pointLength=g,S.spotLength=y,S.rectAreaLength=m,S.hemiLength=_,S.numDirectionalShadows=R,S.numPointShadows=w,S.numSpotShadows=v,S.numSpotMaps=E,S.numLightProbes=D,n.version=w_++)}function l(c,f){let u=0,d=0,p=0,g=0,y=0,m=f.matrixWorldInverse;for(let _=0,R=c.length;_<R;_++){let w=c[_];if(w.isDirectionalLight){let v=n.directional[u];v.direction.setFromMatrixPosition(w.matrixWorld),s.setFromMatrixPosition(w.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(m),u++}else if(w.isSpotLight){let v=n.spot[p];v.position.setFromMatrixPosition(w.matrixWorld),v.position.applyMatrix4(m),v.direction.setFromMatrixPosition(w.matrixWorld),s.setFromMatrixPosition(w.target.matrixWorld),v.direction.sub(s),v.direction.transformDirection(m),p++}else if(w.isRectAreaLight){let v=n.rectArea[g];v.position.setFromMatrixPosition(w.matrixWorld),v.position.applyMatrix4(m),a.identity(),r.copy(w.matrixWorld),r.premultiply(m),a.extractRotation(r),v.halfWidth.set(w.width*.5,0,0),v.halfHeight.set(0,w.height*.5,0),v.halfWidth.applyMatrix4(a),v.halfHeight.applyMatrix4(a),g++}else if(w.isPointLight){let v=n.point[d];v.position.setFromMatrixPosition(w.matrixWorld),v.position.applyMatrix4(m),d++}else if(w.isHemisphereLight){let v=n.hemi[y];v.direction.setFromMatrixPosition(w.matrixWorld),v.direction.transformDirection(m),y++}}}return{setup:o,setupView:l,state:n}}function rf(i){let t=new T_(i),e=[],n=[],s=[];function r(d){u.camera=d,e.length=0,n.length=0,s.length=0}function a(d){e.push(d)}function o(d){n.push(d)}function l(d){s.push(d)}function c(){t.setup(e)}function f(d){t.setupView(e,d)}let u={lightsArray:e,shadowsArray:n,lightProbeGridArray:s,camera:null,lights:t,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:u,setupLights:c,setupLightsView:f,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function E_(i){let t=new WeakMap;function e(s,r=0){let a=t.get(s),o;return a===void 0?(o=new rf(i),t.set(s,[o])):r>=a.length?(o=new rf(i),a.push(o)):o=a[r],o}function n(){t=new WeakMap}return{get:e,dispose:n}}var C_=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,R_=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,P_=[new H(1,0,0),new H(-1,0,0),new H(0,1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1)],I_=[new H(0,-1,0),new H(0,-1,0),new H(0,0,1),new H(0,0,-1),new H(0,-1,0),new H(0,-1,0)],af=new se,Jr=new H,Nc=new H;function D_(i,t,e){let n=new Ds,s=new Kt,r=new Kt,a=new ge,o=new Qa,l=new to,c={},f=e.maxTextureSize,u={[ai]:Xe,[Xe]:ai,[Wn]:Wn},d=new _n({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Kt},radius:{value:4}},vertexShader:C_,fragmentShader:R_}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let g=new tn;g.setAttribute("position",new xe(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let y=new ve(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Br;let _=this.type;this.render=function(C,D,S){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||C.length===0)return;this.type===Jh&&(Jt("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=Br);let T=i.getRenderTarget(),L=i.getActiveCubeFace(),N=i.getActiveMipmapLevel(),F=i.state;F.setBlending(Xn),F.buffers.depth.getReversed()===!0?F.buffers.color.setClear(0,0,0,0):F.buffers.color.setClear(1,1,1,1),F.buffers.depth.setTest(!0),F.setScissorTest(!1);let Y=_!==this.type;Y&&D.traverse(function(J){J.material&&(Array.isArray(J.material)?J.material.forEach(O=>O.needsUpdate=!0):J.material.needsUpdate=!0)});for(let J=0,O=C.length;J<O;J++){let K=C[J],Z=K.shadow;if(Z===void 0){Jt("WebGLShadowMap:",K,"has no shadow.");continue}if(Z.autoUpdate===!1&&Z.needsUpdate===!1)continue;s.copy(Z.mapSize);let st=Z.getFrameExtents();s.multiply(st),r.copy(Z.mapSize),(s.x>f||s.y>f)&&(s.x>f&&(r.x=Math.floor(f/st.x),s.x=r.x*st.x,Z.mapSize.x=r.x),s.y>f&&(r.y=Math.floor(f/st.y),s.y=r.y*st.y,Z.mapSize.y=r.y));let lt=i.state.buffers.depth.getReversed();if(Z.camera._reversedDepth=lt,Z.map===null||Y===!0){if(Z.map!==null&&(Z.map.depthTexture!==null&&(Z.map.depthTexture.dispose(),Z.map.depthTexture=null),Z.map.dispose()),this.type===Vs){if(K.isPointLight){Jt("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}Z.map=new mn(s.x,s.y,{format:cn,type:en,minFilter:Te,magFilter:Te,generateMipmaps:!1}),Z.map.texture.name=K.name+".shadowMap",Z.map.depthTexture=new li(s.x,s.y,qe),Z.map.depthTexture.name=K.name+".shadowMapDepth",Z.map.depthTexture.format=Vn,Z.map.depthTexture.compareFunction=null,Z.map.depthTexture.minFilter=He,Z.map.depthTexture.magFilter=He}else K.isPointLight?(Z.map=new nl(s.x),Z.map.depthTexture=new $a(s.x,Un)):(Z.map=new mn(s.x,s.y),Z.map.depthTexture=new li(s.x,s.y,Un)),Z.map.depthTexture.name=K.name+".shadowMap",Z.map.depthTexture.format=Vn,this.type===Br?(Z.map.depthTexture.compareFunction=lt?Qo:jo,Z.map.depthTexture.minFilter=Te,Z.map.depthTexture.magFilter=Te):(Z.map.depthTexture.compareFunction=null,Z.map.depthTexture.minFilter=He,Z.map.depthTexture.magFilter=He);Z.camera.updateProjectionMatrix()}let St=Z.map.isWebGLCubeRenderTarget?6:1;for(let mt=0;mt<St;mt++){if(Z.map.isWebGLCubeRenderTarget)i.setRenderTarget(Z.map,mt),i.clear();else{mt===0&&(i.setRenderTarget(Z.map),i.clear());let vt=Z.getViewport(mt);a.set(r.x*vt.x,r.y*vt.y,r.x*vt.z,r.y*vt.w),F.viewport(a)}if(K.isPointLight){let vt=Z.camera,qt=Z.matrix,Qt=K.distance||vt.far;Qt!==vt.far&&(vt.far=Qt,vt.updateProjectionMatrix()),Jr.setFromMatrixPosition(K.matrixWorld),vt.position.copy(Jr),Nc.copy(vt.position),Nc.add(P_[mt]),vt.up.copy(I_[mt]),vt.lookAt(Nc),vt.updateMatrixWorld(),qt.makeTranslation(-Jr.x,-Jr.y,-Jr.z),af.multiplyMatrices(vt.projectionMatrix,vt.matrixWorldInverse),Z._frustum.setFromProjectionMatrix(af,vt.coordinateSystem,vt.reversedDepth)}else Z.updateMatrices(K);n=Z.getFrustum(),v(D,S,Z.camera,K,this.type)}Z.isPointLightShadow!==!0&&this.type===Vs&&R(Z,S),Z.needsUpdate=!1}_=this.type,m.needsUpdate=!1,i.setRenderTarget(T,L,N)};function R(C,D){let S=t.update(y);d.defines.VSM_SAMPLES!==C.blurSamples&&(d.defines.VSM_SAMPLES=C.blurSamples,p.defines.VSM_SAMPLES=C.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),C.mapPass===null&&(C.mapPass=new mn(s.x,s.y,{format:cn,type:en})),d.uniforms.shadow_pass.value=C.map.depthTexture,d.uniforms.resolution.value=C.mapSize,d.uniforms.radius.value=C.radius,i.setRenderTarget(C.mapPass),i.clear(),i.renderBufferDirect(D,null,S,d,y,null),p.uniforms.shadow_pass.value=C.mapPass.texture,p.uniforms.resolution.value=C.mapSize,p.uniforms.radius.value=C.radius,i.setRenderTarget(C.map),i.clear(),i.renderBufferDirect(D,null,S,p,y,null)}function w(C,D,S,T){let L=null,N=S.isPointLight===!0?C.customDistanceMaterial:C.customDepthMaterial;if(N!==void 0)L=N;else if(L=S.isPointLight===!0?l:o,i.localClippingEnabled&&D.clipShadows===!0&&Array.isArray(D.clippingPlanes)&&D.clippingPlanes.length!==0||D.displacementMap&&D.displacementScale!==0||D.alphaMap&&D.alphaTest>0||D.map&&D.alphaTest>0||D.alphaToCoverage===!0){let F=L.uuid,Y=D.uuid,J=c[F];J===void 0&&(J={},c[F]=J);let O=J[Y];O===void 0&&(O=L.clone(),J[Y]=O,D.addEventListener("dispose",E)),L=O}if(L.visible=D.visible,L.wireframe=D.wireframe,T===Vs?L.side=D.shadowSide!==null?D.shadowSide:D.side:L.side=D.shadowSide!==null?D.shadowSide:u[D.side],L.alphaMap=D.alphaMap,L.alphaTest=D.alphaToCoverage===!0?.5:D.alphaTest,L.map=D.map,L.clipShadows=D.clipShadows,L.clippingPlanes=D.clippingPlanes,L.clipIntersection=D.clipIntersection,L.displacementMap=D.displacementMap,L.displacementScale=D.displacementScale,L.displacementBias=D.displacementBias,L.wireframeLinewidth=D.wireframeLinewidth,L.linewidth=D.linewidth,S.isPointLight===!0&&L.isMeshDistanceMaterial===!0){let F=i.properties.get(L);F.light=S}return L}function v(C,D,S,T,L){if(C.visible===!1)return;if(C.layers.test(D.layers)&&(C.isMesh||C.isLine||C.isPoints)&&(C.castShadow||C.receiveShadow&&L===Vs)&&(!C.frustumCulled||n.intersectsObject(C))){C.modelViewMatrix.multiplyMatrices(S.matrixWorldInverse,C.matrixWorld);let Y=t.update(C),J=C.material;if(Array.isArray(J)){let O=Y.groups;for(let K=0,Z=O.length;K<Z;K++){let st=O[K],lt=J[st.materialIndex];if(lt&&lt.visible){let St=w(C,lt,T,L);C.onBeforeShadow(i,C,D,S,Y,St,st),i.renderBufferDirect(S,null,Y,St,C,st),C.onAfterShadow(i,C,D,S,Y,St,st)}}}else if(J.visible){let O=w(C,J,T,L);C.onBeforeShadow(i,C,D,S,Y,O,null),i.renderBufferDirect(S,null,Y,O,C,null),C.onAfterShadow(i,C,D,S,Y,O,null)}}let F=C.children;for(let Y=0,J=F.length;Y<J;Y++)v(F[Y],D,S,T,L)}function E(C){C.target.removeEventListener("dispose",E);for(let S in c){let T=c[S],L=C.target.uuid;L in T&&(T[L].dispose(),delete T[L])}}}function U_(i,t){function e(){let B=!1,Q=new ge,rt=null,Tt=new ge(0,0,0,0);return{setMask:function(Rt){rt!==Rt&&!B&&(i.colorMask(Rt,Rt,Rt,Rt),rt=Rt)},setLocked:function(Rt){B=Rt},setClear:function(Rt,ut,Wt,Gt,be){be===!0&&(Rt*=Gt,ut*=Gt,Wt*=Gt),Q.set(Rt,ut,Wt,Gt),Tt.equals(Q)===!1&&(i.clearColor(Rt,ut,Wt,Gt),Tt.copy(Q))},reset:function(){B=!1,rt=null,Tt.set(-1,0,0,0)}}}function n(){let B=!1,Q=!1,rt=null,Tt=null,Rt=null;return{setReversed:function(ut){if(Q!==ut){let Wt=t.get("EXT_clip_control");ut?Wt.clipControlEXT(Wt.LOWER_LEFT_EXT,Wt.ZERO_TO_ONE_EXT):Wt.clipControlEXT(Wt.LOWER_LEFT_EXT,Wt.NEGATIVE_ONE_TO_ONE_EXT),Q=ut;let Gt=Rt;Rt=null,this.setClear(Gt)}},getReversed:function(){return Q},setTest:function(ut){ut?ht(i.DEPTH_TEST):gt(i.DEPTH_TEST)},setMask:function(ut){rt!==ut&&!B&&(i.depthMask(ut),rt=ut)},setFunc:function(ut){if(Q&&(ut=Pu[ut]),Tt!==ut){switch(ut){case za:i.depthFunc(i.NEVER);break;case Va:i.depthFunc(i.ALWAYS);break;case Ga:i.depthFunc(i.LESS);break;case Hi:i.depthFunc(i.LEQUAL);break;case Ha:i.depthFunc(i.EQUAL);break;case Wa:i.depthFunc(i.GEQUAL);break;case Xa:i.depthFunc(i.GREATER);break;case qa:i.depthFunc(i.NOTEQUAL);break;default:i.depthFunc(i.LEQUAL)}Tt=ut}},setLocked:function(ut){B=ut},setClear:function(ut){Rt!==ut&&(Rt=ut,Q&&(ut=1-ut),i.clearDepth(ut))},reset:function(){B=!1,rt=null,Tt=null,Rt=null,Q=!1}}}function s(){let B=!1,Q=null,rt=null,Tt=null,Rt=null,ut=null,Wt=null,Gt=null,be=null;return{setTest:function(_e){B||(_e?ht(i.STENCIL_TEST):gt(i.STENCIL_TEST))},setMask:function(_e){Q!==_e&&!B&&(i.stencilMask(_e),Q=_e)},setFunc:function(_e,yn,vn){(rt!==_e||Tt!==yn||Rt!==vn)&&(i.stencilFunc(_e,yn,vn),rt=_e,Tt=yn,Rt=vn)},setOp:function(_e,yn,vn){(ut!==_e||Wt!==yn||Gt!==vn)&&(i.stencilOp(_e,yn,vn),ut=_e,Wt=yn,Gt=vn)},setLocked:function(_e){B=_e},setClear:function(_e){be!==_e&&(i.clearStencil(_e),be=_e)},reset:function(){B=!1,Q=null,rt=null,Tt=null,Rt=null,ut=null,Wt=null,Gt=null,be=null}}}let r=new e,a=new n,o=new s,l=new WeakMap,c=new WeakMap,f={},u={},d={},p=new WeakMap,g=[],y=null,m=!1,_=null,R=null,w=null,v=null,E=null,C=null,D=null,S=new ie(0,0,0),T=0,L=!1,N=null,F=null,Y=null,J=null,O=null,K=i.getParameter(i.MAX_COMBINED_TEXTURE_IMAGE_UNITS),Z=!1,st=0,lt=i.getParameter(i.VERSION);lt.indexOf("WebGL")!==-1?(st=parseFloat(/^WebGL (\d)/.exec(lt)[1]),Z=st>=1):lt.indexOf("OpenGL ES")!==-1&&(st=parseFloat(/^OpenGL ES (\d)/.exec(lt)[1]),Z=st>=2);let St=null,mt={},vt=i.getParameter(i.SCISSOR_BOX),qt=i.getParameter(i.VIEWPORT),Qt=new ge().fromArray(vt),kt=new ge().fromArray(qt);function tt(B,Q,rt,Tt){let Rt=new Uint8Array(4),ut=i.createTexture();i.bindTexture(B,ut),i.texParameteri(B,i.TEXTURE_MIN_FILTER,i.NEAREST),i.texParameteri(B,i.TEXTURE_MAG_FILTER,i.NEAREST);for(let Wt=0;Wt<rt;Wt++)B===i.TEXTURE_3D||B===i.TEXTURE_2D_ARRAY?i.texImage3D(Q,0,i.RGBA,1,1,Tt,0,i.RGBA,i.UNSIGNED_BYTE,Rt):i.texImage2D(Q+Wt,0,i.RGBA,1,1,0,i.RGBA,i.UNSIGNED_BYTE,Rt);return ut}let ot={};ot[i.TEXTURE_2D]=tt(i.TEXTURE_2D,i.TEXTURE_2D,1),ot[i.TEXTURE_CUBE_MAP]=tt(i.TEXTURE_CUBE_MAP,i.TEXTURE_CUBE_MAP_POSITIVE_X,6),ot[i.TEXTURE_2D_ARRAY]=tt(i.TEXTURE_2D_ARRAY,i.TEXTURE_2D_ARRAY,1,1),ot[i.TEXTURE_3D]=tt(i.TEXTURE_3D,i.TEXTURE_3D,1,1),r.setClear(0,0,0,1),a.setClear(1),o.setClear(0),ht(i.DEPTH_TEST),a.setFunc(Hi),Ce(!1),Ie(tc),ht(i.CULL_FACE),Zt(Xn);function ht(B){f[B]!==!0&&(i.enable(B),f[B]=!0)}function gt(B){f[B]!==!1&&(i.disable(B),f[B]=!1)}function Nt(B,Q){return d[B]!==Q?(i.bindFramebuffer(B,Q),d[B]=Q,B===i.DRAW_FRAMEBUFFER&&(d[i.FRAMEBUFFER]=Q),B===i.FRAMEBUFFER&&(d[i.DRAW_FRAMEBUFFER]=Q),!0):!1}function Lt(B,Q){let rt=g,Tt=!1;if(B){rt=p.get(Q),rt===void 0&&(rt=[],p.set(Q,rt));let Rt=B.textures;if(rt.length!==Rt.length||rt[0]!==i.COLOR_ATTACHMENT0){for(let ut=0,Wt=Rt.length;ut<Wt;ut++)rt[ut]=i.COLOR_ATTACHMENT0+ut;rt.length=Rt.length,Tt=!0}}else rt[0]!==i.BACK&&(rt[0]=i.BACK,Tt=!0);Tt&&i.drawBuffers(rt)}function re(B){return y!==B?(i.useProgram(B),y=B,!0):!1}let Dt={[bi]:i.FUNC_ADD,[$h]:i.FUNC_SUBTRACT,[jh]:i.FUNC_REVERSE_SUBTRACT};Dt[Qh]=i.MIN,Dt[tu]=i.MAX;let $t={[eu]:i.ZERO,[nu]:i.ONE,[iu]:i.SRC_COLOR,[Ba]:i.SRC_ALPHA,[cu]:i.SRC_ALPHA_SATURATE,[ou]:i.DST_COLOR,[ru]:i.DST_ALPHA,[su]:i.ONE_MINUS_SRC_COLOR,[ka]:i.ONE_MINUS_SRC_ALPHA,[lu]:i.ONE_MINUS_DST_COLOR,[au]:i.ONE_MINUS_DST_ALPHA,[hu]:i.CONSTANT_COLOR,[uu]:i.ONE_MINUS_CONSTANT_COLOR,[fu]:i.CONSTANT_ALPHA,[du]:i.ONE_MINUS_CONSTANT_ALPHA};function Zt(B,Q,rt,Tt,Rt,ut,Wt,Gt,be,_e){if(B===Xn){m===!0&&(gt(i.BLEND),m=!1);return}if(m===!1&&(ht(i.BLEND),m=!0),B!==Kh){if(B!==_||_e!==L){if((R!==bi||E!==bi)&&(i.blendEquation(i.FUNC_ADD),R=bi,E=bi),_e)switch(B){case Gi:i.blendFuncSeparate(i.ONE,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case ec:i.blendFunc(i.ONE,i.ONE);break;case nc:i.blendFuncSeparate(i.ZERO,i.ONE_MINUS_SRC_COLOR,i.ZERO,i.ONE);break;case ic:i.blendFuncSeparate(i.DST_COLOR,i.ONE_MINUS_SRC_ALPHA,i.ZERO,i.ONE);break;default:jt("WebGLState: Invalid blending: ",B);break}else switch(B){case Gi:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE_MINUS_SRC_ALPHA,i.ONE,i.ONE_MINUS_SRC_ALPHA);break;case ec:i.blendFuncSeparate(i.SRC_ALPHA,i.ONE,i.ONE,i.ONE);break;case nc:jt("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case ic:jt("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:jt("WebGLState: Invalid blending: ",B);break}w=null,v=null,C=null,D=null,S.set(0,0,0),T=0,_=B,L=_e}return}Rt=Rt||Q,ut=ut||rt,Wt=Wt||Tt,(Q!==R||Rt!==E)&&(i.blendEquationSeparate(Dt[Q],Dt[Rt]),R=Q,E=Rt),(rt!==w||Tt!==v||ut!==C||Wt!==D)&&(i.blendFuncSeparate($t[rt],$t[Tt],$t[ut],$t[Wt]),w=rt,v=Tt,C=ut,D=Wt),(Gt.equals(S)===!1||be!==T)&&(i.blendColor(Gt.r,Gt.g,Gt.b,be),S.copy(Gt),T=be),_=B,L=!1}function le(B,Q){B.side===Wn?gt(i.CULL_FACE):ht(i.CULL_FACE);let rt=B.side===Xe;Q&&(rt=!rt),Ce(rt),B.blending===Gi&&B.transparent===!1?Zt(Xn):Zt(B.blending,B.blendEquation,B.blendSrc,B.blendDst,B.blendEquationAlpha,B.blendSrcAlpha,B.blendDstAlpha,B.blendColor,B.blendAlpha,B.premultipliedAlpha),a.setFunc(B.depthFunc),a.setTest(B.depthTest),a.setMask(B.depthWrite),r.setMask(B.colorWrite);let Tt=B.stencilWrite;o.setTest(Tt),Tt&&(o.setMask(B.stencilWriteMask),o.setFunc(B.stencilFunc,B.stencilRef,B.stencilFuncMask),o.setOp(B.stencilFail,B.stencilZFail,B.stencilZPass)),Ne(B.polygonOffset,B.polygonOffsetFactor,B.polygonOffsetUnits),B.alphaToCoverage===!0?ht(i.SAMPLE_ALPHA_TO_COVERAGE):gt(i.SAMPLE_ALPHA_TO_COVERAGE)}function Ce(B){N!==B&&(B?i.frontFace(i.CW):i.frontFace(i.CCW),N=B)}function Ie(B){B!==Yh?(ht(i.CULL_FACE),B!==F&&(B===tc?i.cullFace(i.BACK):B===Zh?i.cullFace(i.FRONT):i.cullFace(i.FRONT_AND_BACK))):gt(i.CULL_FACE),F=B}function De(B){B!==Y&&(Z&&i.lineWidth(B),Y=B)}function Ne(B,Q,rt){B?(ht(i.POLYGON_OFFSET_FILL),(J!==Q||O!==rt)&&(J=Q,O=rt,a.getReversed()&&(Q=-Q),i.polygonOffset(Q,rt))):gt(i.POLYGON_OFFSET_FILL)}function Se(B){B?ht(i.SCISSOR_TEST):gt(i.SCISSOR_TEST)}function Re(B){B===void 0&&(B=i.TEXTURE0+K-1),St!==B&&(i.activeTexture(B),St=B)}function V(B,Q,rt){rt===void 0&&(St===null?rt=i.TEXTURE0+K-1:rt=St);let Tt=mt[rt];Tt===void 0&&(Tt={type:void 0,texture:void 0},mt[rt]=Tt),(Tt.type!==B||Tt.texture!==Q)&&(St!==rt&&(i.activeTexture(rt),St=rt),i.bindTexture(B,Q||ot[B]),Tt.type=B,Tt.texture=Q)}function Ke(){let B=mt[St];B!==void 0&&B.type!==void 0&&(i.bindTexture(B.type,null),B.type=void 0,B.texture=void 0)}function ue(){try{i.compressedTexImage2D(...arguments)}catch(B){jt("WebGLState:",B)}}function U(){try{i.compressedTexImage3D(...arguments)}catch(B){jt("WebGLState:",B)}}function b(){try{i.texSubImage2D(...arguments)}catch(B){jt("WebGLState:",B)}}function X(){try{i.texSubImage3D(...arguments)}catch(B){jt("WebGLState:",B)}}function j(){try{i.compressedTexSubImage2D(...arguments)}catch(B){jt("WebGLState:",B)}}function et(){try{i.compressedTexSubImage3D(...arguments)}catch(B){jt("WebGLState:",B)}}function yt(){try{i.texStorage2D(...arguments)}catch(B){jt("WebGLState:",B)}}function Mt(){try{i.texStorage3D(...arguments)}catch(B){jt("WebGLState:",B)}}function it(){try{i.texImage2D(...arguments)}catch(B){jt("WebGLState:",B)}}function at(){try{i.texImage3D(...arguments)}catch(B){jt("WebGLState:",B)}}function At(B){return u[B]!==void 0?u[B]:i.getParameter(B)}function Ut(B,Q){u[B]!==Q&&(i.pixelStorei(B,Q),u[B]=Q)}function xt(B){Qt.equals(B)===!1&&(i.scissor(B.x,B.y,B.z,B.w),Qt.copy(B))}function wt(B){kt.equals(B)===!1&&(i.viewport(B.x,B.y,B.z,B.w),kt.copy(B))}function Vt(B,Q){let rt=c.get(Q);rt===void 0&&(rt=new WeakMap,c.set(Q,rt));let Tt=rt.get(B);Tt===void 0&&(Tt=i.getUniformBlockIndex(Q,B.name),rt.set(B,Tt))}function Ft(B,Q){let Tt=c.get(Q).get(B);l.get(Q)!==Tt&&(i.uniformBlockBinding(Q,Tt,B.__bindingPointIndex),l.set(Q,Tt))}function Yt(){i.disable(i.BLEND),i.disable(i.CULL_FACE),i.disable(i.DEPTH_TEST),i.disable(i.POLYGON_OFFSET_FILL),i.disable(i.SCISSOR_TEST),i.disable(i.STENCIL_TEST),i.disable(i.SAMPLE_ALPHA_TO_COVERAGE),i.blendEquation(i.FUNC_ADD),i.blendFunc(i.ONE,i.ZERO),i.blendFuncSeparate(i.ONE,i.ZERO,i.ONE,i.ZERO),i.blendColor(0,0,0,0),i.colorMask(!0,!0,!0,!0),i.clearColor(0,0,0,0),i.depthMask(!0),i.depthFunc(i.LESS),a.setReversed(!1),i.clearDepth(1),i.stencilMask(4294967295),i.stencilFunc(i.ALWAYS,0,4294967295),i.stencilOp(i.KEEP,i.KEEP,i.KEEP),i.clearStencil(0),i.cullFace(i.BACK),i.frontFace(i.CCW),i.polygonOffset(0,0),i.activeTexture(i.TEXTURE0),i.bindFramebuffer(i.FRAMEBUFFER,null),i.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),i.bindFramebuffer(i.READ_FRAMEBUFFER,null),i.useProgram(null),i.lineWidth(1),i.scissor(0,0,i.canvas.width,i.canvas.height),i.viewport(0,0,i.canvas.width,i.canvas.height),i.pixelStorei(i.PACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_ALIGNMENT,4),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,i.BROWSER_DEFAULT_WEBGL),i.pixelStorei(i.PACK_ROW_LENGTH,0),i.pixelStorei(i.PACK_SKIP_PIXELS,0),i.pixelStorei(i.PACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_ROW_LENGTH,0),i.pixelStorei(i.UNPACK_IMAGE_HEIGHT,0),i.pixelStorei(i.UNPACK_SKIP_PIXELS,0),i.pixelStorei(i.UNPACK_SKIP_ROWS,0),i.pixelStorei(i.UNPACK_SKIP_IMAGES,0),f={},u={},St=null,mt={},d={},p=new WeakMap,g=[],y=null,m=!1,_=null,R=null,w=null,v=null,E=null,C=null,D=null,S=new ie(0,0,0),T=0,L=!1,N=null,F=null,Y=null,J=null,O=null,Qt.set(0,0,i.canvas.width,i.canvas.height),kt.set(0,0,i.canvas.width,i.canvas.height),r.reset(),a.reset(),o.reset()}return{buffers:{color:r,depth:a,stencil:o},enable:ht,disable:gt,bindFramebuffer:Nt,drawBuffers:Lt,useProgram:re,setBlending:Zt,setMaterial:le,setFlipSided:Ce,setCullFace:Ie,setLineWidth:De,setPolygonOffset:Ne,setScissorTest:Se,activeTexture:Re,bindTexture:V,unbindTexture:Ke,compressedTexImage2D:ue,compressedTexImage3D:U,texImage2D:it,texImage3D:at,pixelStorei:Ut,getParameter:At,updateUBOMapping:Vt,uniformBlockBinding:Ft,texStorage2D:yt,texStorage3D:Mt,texSubImage2D:b,texSubImage3D:X,compressedTexSubImage2D:j,compressedTexSubImage3D:et,scissor:xt,viewport:wt,reset:Yt}}function L_(i,t,e,n,s,r,a){let o=t.has("WEBGL_multisampled_render_to_texture")?t.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Kt,f=new WeakMap,u=new Set,d,p=new WeakMap,g=!1;try{g=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function y(U,b){return g?new OffscreenCanvas(U,b):ur("canvas")}function m(U,b,X){let j=1,et=ue(U);if((et.width>X||et.height>X)&&(j=X/Math.max(et.width,et.height)),j<1)if(typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&U instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&U instanceof ImageBitmap||typeof VideoFrame<"u"&&U instanceof VideoFrame){let yt=Math.floor(j*et.width),Mt=Math.floor(j*et.height);d===void 0&&(d=y(yt,Mt));let it=b?y(yt,Mt):d;return it.width=yt,it.height=Mt,it.getContext("2d").drawImage(U,0,0,yt,Mt),Jt("WebGLRenderer: Texture has been resized from ("+et.width+"x"+et.height+") to ("+yt+"x"+Mt+")."),it}else return"data"in U&&Jt("WebGLRenderer: Image in DataTexture is too big ("+et.width+"x"+et.height+")."),U;return U}function _(U){return U.generateMipmaps}function R(U){i.generateMipmap(U)}function w(U){return U.isWebGLCubeRenderTarget?i.TEXTURE_CUBE_MAP:U.isWebGL3DRenderTarget?i.TEXTURE_3D:U.isWebGLArrayRenderTarget||U.isCompressedArrayTexture?i.TEXTURE_2D_ARRAY:i.TEXTURE_2D}function v(U,b,X,j,et,yt=!1){if(U!==null){if(i[U]!==void 0)return i[U];Jt("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+U+"'")}let Mt;j&&(Mt=t.get("EXT_texture_norm16"),Mt||Jt("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let it=b;if(b===i.RED&&(X===i.FLOAT&&(it=i.R32F),X===i.HALF_FLOAT&&(it=i.R16F),X===i.UNSIGNED_BYTE&&(it=i.R8),X===i.UNSIGNED_SHORT&&Mt&&(it=Mt.R16_EXT),X===i.SHORT&&Mt&&(it=Mt.R16_SNORM_EXT)),b===i.RED_INTEGER&&(X===i.UNSIGNED_BYTE&&(it=i.R8UI),X===i.UNSIGNED_SHORT&&(it=i.R16UI),X===i.UNSIGNED_INT&&(it=i.R32UI),X===i.BYTE&&(it=i.R8I),X===i.SHORT&&(it=i.R16I),X===i.INT&&(it=i.R32I)),b===i.RG&&(X===i.FLOAT&&(it=i.RG32F),X===i.HALF_FLOAT&&(it=i.RG16F),X===i.UNSIGNED_BYTE&&(it=i.RG8),X===i.UNSIGNED_SHORT&&Mt&&(it=Mt.RG16_EXT),X===i.SHORT&&Mt&&(it=Mt.RG16_SNORM_EXT)),b===i.RG_INTEGER&&(X===i.UNSIGNED_BYTE&&(it=i.RG8UI),X===i.UNSIGNED_SHORT&&(it=i.RG16UI),X===i.UNSIGNED_INT&&(it=i.RG32UI),X===i.BYTE&&(it=i.RG8I),X===i.SHORT&&(it=i.RG16I),X===i.INT&&(it=i.RG32I)),b===i.RGB_INTEGER&&(X===i.UNSIGNED_BYTE&&(it=i.RGB8UI),X===i.UNSIGNED_SHORT&&(it=i.RGB16UI),X===i.UNSIGNED_INT&&(it=i.RGB32UI),X===i.BYTE&&(it=i.RGB8I),X===i.SHORT&&(it=i.RGB16I),X===i.INT&&(it=i.RGB32I)),b===i.RGBA_INTEGER&&(X===i.UNSIGNED_BYTE&&(it=i.RGBA8UI),X===i.UNSIGNED_SHORT&&(it=i.RGBA16UI),X===i.UNSIGNED_INT&&(it=i.RGBA32UI),X===i.BYTE&&(it=i.RGBA8I),X===i.SHORT&&(it=i.RGBA16I),X===i.INT&&(it=i.RGBA32I)),b===i.RGB&&(X===i.UNSIGNED_SHORT&&Mt&&(it=Mt.RGB16_EXT),X===i.SHORT&&Mt&&(it=Mt.RGB16_SNORM_EXT),X===i.UNSIGNED_INT_5_9_9_9_REV&&(it=i.RGB9_E5),X===i.UNSIGNED_INT_10F_11F_11F_REV&&(it=i.R11F_G11F_B10F)),b===i.RGBA){let at=yt?hr:ce.getTransfer(et);X===i.FLOAT&&(it=i.RGBA32F),X===i.HALF_FLOAT&&(it=i.RGBA16F),X===i.UNSIGNED_BYTE&&(it=at===me?i.SRGB8_ALPHA8:i.RGBA8),X===i.UNSIGNED_SHORT&&Mt&&(it=Mt.RGBA16_EXT),X===i.SHORT&&Mt&&(it=Mt.RGBA16_SNORM_EXT),X===i.UNSIGNED_SHORT_4_4_4_4&&(it=i.RGBA4),X===i.UNSIGNED_SHORT_5_5_5_1&&(it=i.RGB5_A1)}return(it===i.R16F||it===i.R32F||it===i.RG16F||it===i.RG32F||it===i.RGBA16F||it===i.RGBA32F)&&t.get("EXT_color_buffer_float"),it}function E(U,b){let X;return U?b===null||b===Un||b===Hs?X=i.DEPTH24_STENCIL8:b===qe?X=i.DEPTH32F_STENCIL8:b===Gs&&(X=i.DEPTH24_STENCIL8,Jt("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===Un||b===Hs?X=i.DEPTH_COMPONENT24:b===qe?X=i.DEPTH_COMPONENT32F:b===Gs&&(X=i.DEPTH_COMPONENT16),X}function C(U,b){return _(U)===!0||U.isFramebufferTexture&&U.minFilter!==He&&U.minFilter!==Te?Math.log2(Math.max(b.width,b.height))+1:U.mipmaps!==void 0&&U.mipmaps.length>0?U.mipmaps.length:U.isCompressedTexture&&Array.isArray(U.image)?b.mipmaps.length:1}function D(U){let b=U.target;b.removeEventListener("dispose",D),T(b),b.isVideoTexture&&f.delete(b),b.isHTMLTexture&&u.delete(b)}function S(U){let b=U.target;b.removeEventListener("dispose",S),N(b)}function T(U){let b=n.get(U);if(b.__webglInit===void 0)return;let X=U.source,j=p.get(X);if(j){let et=j[b.__cacheKey];et.usedTimes--,et.usedTimes===0&&L(U),Object.keys(j).length===0&&p.delete(X)}n.remove(U)}function L(U){let b=n.get(U);i.deleteTexture(b.__webglTexture);let X=U.source,j=p.get(X);delete j[b.__cacheKey],a.memory.textures--}function N(U){let b=n.get(U);if(U.depthTexture&&(U.depthTexture.dispose(),n.remove(U.depthTexture)),U.isWebGLCubeRenderTarget)for(let j=0;j<6;j++){if(Array.isArray(b.__webglFramebuffer[j]))for(let et=0;et<b.__webglFramebuffer[j].length;et++)i.deleteFramebuffer(b.__webglFramebuffer[j][et]);else i.deleteFramebuffer(b.__webglFramebuffer[j]);b.__webglDepthbuffer&&i.deleteRenderbuffer(b.__webglDepthbuffer[j])}else{if(Array.isArray(b.__webglFramebuffer))for(let j=0;j<b.__webglFramebuffer.length;j++)i.deleteFramebuffer(b.__webglFramebuffer[j]);else i.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&i.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&i.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let j=0;j<b.__webglColorRenderbuffer.length;j++)b.__webglColorRenderbuffer[j]&&i.deleteRenderbuffer(b.__webglColorRenderbuffer[j]);b.__webglDepthRenderbuffer&&i.deleteRenderbuffer(b.__webglDepthRenderbuffer)}let X=U.textures;for(let j=0,et=X.length;j<et;j++){let yt=n.get(X[j]);yt.__webglTexture&&(i.deleteTexture(yt.__webglTexture),a.memory.textures--),n.remove(X[j])}n.remove(U)}let F=0;function Y(){F=0}function J(){return F}function O(U){F=U}function K(){let U=F;return U>=s.maxTextures&&Jt("WebGLTextures: Trying to use "+U+" texture units while this GPU supports only "+s.maxTextures),F+=1,U}function Z(U){let b=[];return b.push(U.wrapS),b.push(U.wrapT),b.push(U.wrapR||0),b.push(U.magFilter),b.push(U.minFilter),b.push(U.anisotropy),b.push(U.internalFormat),b.push(U.format),b.push(U.type),b.push(U.generateMipmaps),b.push(U.premultiplyAlpha),b.push(U.flipY),b.push(U.unpackAlignment),b.push(U.colorSpace),b.join()}function st(U,b){let X=n.get(U);if(U.isVideoTexture&&V(U),U.isRenderTargetTexture===!1&&U.isExternalTexture!==!0&&U.version>0&&X.__version!==U.version){let j=U.image;if(j===null)Jt("WebGLRenderer: Texture marked for update but no image data found.");else if(j.complete===!1)Jt("WebGLRenderer: Texture marked for update but image is incomplete");else{gt(X,U,b);return}}else U.isExternalTexture&&(X.__webglTexture=U.sourceTexture?U.sourceTexture:null);e.bindTexture(i.TEXTURE_2D,X.__webglTexture,i.TEXTURE0+b)}function lt(U,b){let X=n.get(U);if(U.isRenderTargetTexture===!1&&U.version>0&&X.__version!==U.version){gt(X,U,b);return}else U.isExternalTexture&&(X.__webglTexture=U.sourceTexture?U.sourceTexture:null);e.bindTexture(i.TEXTURE_2D_ARRAY,X.__webglTexture,i.TEXTURE0+b)}function St(U,b){let X=n.get(U);if(U.isRenderTargetTexture===!1&&U.version>0&&X.__version!==U.version){gt(X,U,b);return}e.bindTexture(i.TEXTURE_3D,X.__webglTexture,i.TEXTURE0+b)}function mt(U,b){let X=n.get(U);if(U.isCubeDepthTexture!==!0&&U.version>0&&X.__version!==U.version){Nt(X,U,b);return}e.bindTexture(i.TEXTURE_CUBE_MAP,X.__webglTexture,i.TEXTURE0+b)}let vt={[Wi]:i.REPEAT,[an]:i.CLAMP_TO_EDGE,[As]:i.MIRRORED_REPEAT},qt={[He]:i.NEAREST,[_u]:i.NEAREST_MIPMAP_NEAREST,[zr]:i.NEAREST_MIPMAP_LINEAR,[Te]:i.LINEAR,[mo]:i.LINEAR_MIPMAP_NEAREST,[fi]:i.LINEAR_MIPMAP_LINEAR},Qt={[Su]:i.NEVER,[Tu]:i.ALWAYS,[Mu]:i.LESS,[jo]:i.LEQUAL,[bu]:i.EQUAL,[Qo]:i.GEQUAL,[wu]:i.GREATER,[Au]:i.NOTEQUAL};function kt(U,b){if(b.type===qe&&t.has("OES_texture_float_linear")===!1&&(b.magFilter===Te||b.magFilter===mo||b.magFilter===zr||b.magFilter===fi||b.minFilter===Te||b.minFilter===mo||b.minFilter===zr||b.minFilter===fi)&&Jt("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),i.texParameteri(U,i.TEXTURE_WRAP_S,vt[b.wrapS]),i.texParameteri(U,i.TEXTURE_WRAP_T,vt[b.wrapT]),(U===i.TEXTURE_3D||U===i.TEXTURE_2D_ARRAY)&&i.texParameteri(U,i.TEXTURE_WRAP_R,vt[b.wrapR]),i.texParameteri(U,i.TEXTURE_MAG_FILTER,qt[b.magFilter]),i.texParameteri(U,i.TEXTURE_MIN_FILTER,qt[b.minFilter]),b.compareFunction&&(i.texParameteri(U,i.TEXTURE_COMPARE_MODE,i.COMPARE_REF_TO_TEXTURE),i.texParameteri(U,i.TEXTURE_COMPARE_FUNC,Qt[b.compareFunction])),t.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===He||b.minFilter!==zr&&b.minFilter!==fi||b.type===qe&&t.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){let X=t.get("EXT_texture_filter_anisotropic");i.texParameterf(U,X.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,s.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function tt(U,b){let X=!1;U.__webglInit===void 0&&(U.__webglInit=!0,b.addEventListener("dispose",D));let j=b.source,et=p.get(j);et===void 0&&(et={},p.set(j,et));let yt=Z(b);if(yt!==U.__cacheKey){et[yt]===void 0&&(et[yt]={texture:i.createTexture(),usedTimes:0},a.memory.textures++,X=!0),et[yt].usedTimes++;let Mt=et[U.__cacheKey];Mt!==void 0&&(et[U.__cacheKey].usedTimes--,Mt.usedTimes===0&&L(b)),U.__cacheKey=yt,U.__webglTexture=et[yt].texture}return X}function ot(U,b,X){return Math.floor(Math.floor(U/X)/b)}function ht(U,b,X,j){let yt=U.updateRanges;if(yt.length===0)e.texSubImage2D(i.TEXTURE_2D,0,0,0,b.width,b.height,X,j,b.data);else{yt.sort((Ut,xt)=>Ut.start-xt.start);let Mt=0;for(let Ut=1;Ut<yt.length;Ut++){let xt=yt[Mt],wt=yt[Ut],Vt=xt.start+xt.count,Ft=ot(wt.start,b.width,4),Yt=ot(xt.start,b.width,4);wt.start<=Vt+1&&Ft===Yt&&ot(wt.start+wt.count-1,b.width,4)===Ft?xt.count=Math.max(xt.count,wt.start+wt.count-xt.start):(++Mt,yt[Mt]=wt)}yt.length=Mt+1;let it=e.getParameter(i.UNPACK_ROW_LENGTH),at=e.getParameter(i.UNPACK_SKIP_PIXELS),At=e.getParameter(i.UNPACK_SKIP_ROWS);e.pixelStorei(i.UNPACK_ROW_LENGTH,b.width);for(let Ut=0,xt=yt.length;Ut<xt;Ut++){let wt=yt[Ut],Vt=Math.floor(wt.start/4),Ft=Math.ceil(wt.count/4),Yt=Vt%b.width,B=Math.floor(Vt/b.width),Q=Ft,rt=1;e.pixelStorei(i.UNPACK_SKIP_PIXELS,Yt),e.pixelStorei(i.UNPACK_SKIP_ROWS,B),e.texSubImage2D(i.TEXTURE_2D,0,Yt,B,Q,rt,X,j,b.data)}U.clearUpdateRanges(),e.pixelStorei(i.UNPACK_ROW_LENGTH,it),e.pixelStorei(i.UNPACK_SKIP_PIXELS,at),e.pixelStorei(i.UNPACK_SKIP_ROWS,At)}}function gt(U,b,X){let j=i.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(j=i.TEXTURE_2D_ARRAY),b.isData3DTexture&&(j=i.TEXTURE_3D);let et=tt(U,b),yt=b.source;e.bindTexture(j,U.__webglTexture,i.TEXTURE0+X);let Mt=n.get(yt);if(yt.version!==Mt.__version||et===!0){if(e.activeTexture(i.TEXTURE0+X),(typeof ImageBitmap<"u"&&b.image instanceof ImageBitmap)===!1){let rt=ce.getPrimaries(ce.workingColorSpace),Tt=b.colorSpace===Ye?null:ce.getPrimaries(b.colorSpace),Rt=b.colorSpace===Ye||rt===Tt?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,b.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,Rt)}e.pixelStorei(i.UNPACK_ALIGNMENT,b.unpackAlignment);let at=m(b.image,!1,s.maxTextureSize);at=Ke(b,at);let At=r.convert(b.format,b.colorSpace),Ut=r.convert(b.type),xt=v(b.internalFormat,At,Ut,b.normalized,b.colorSpace,b.isVideoTexture);kt(j,b);let wt,Vt=b.mipmaps,Ft=b.isVideoTexture!==!0,Yt=Mt.__version===void 0||et===!0,B=yt.dataReady,Q=C(b,at);if(b.isDepthTexture)xt=E(b.format===Pi,b.type),Yt&&(Ft?e.texStorage2D(i.TEXTURE_2D,1,xt,at.width,at.height):e.texImage2D(i.TEXTURE_2D,0,xt,at.width,at.height,0,At,Ut,null));else if(b.isDataTexture)if(Vt.length>0){Ft&&Yt&&e.texStorage2D(i.TEXTURE_2D,Q,xt,Vt[0].width,Vt[0].height);for(let rt=0,Tt=Vt.length;rt<Tt;rt++)wt=Vt[rt],Ft?B&&e.texSubImage2D(i.TEXTURE_2D,rt,0,0,wt.width,wt.height,At,Ut,wt.data):e.texImage2D(i.TEXTURE_2D,rt,xt,wt.width,wt.height,0,At,Ut,wt.data);b.generateMipmaps=!1}else Ft?(Yt&&e.texStorage2D(i.TEXTURE_2D,Q,xt,at.width,at.height),B&&ht(b,at,At,Ut)):e.texImage2D(i.TEXTURE_2D,0,xt,at.width,at.height,0,At,Ut,at.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){Ft&&Yt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,Q,xt,Vt[0].width,Vt[0].height,at.depth);for(let rt=0,Tt=Vt.length;rt<Tt;rt++)if(wt=Vt[rt],b.format!==Le)if(At!==null)if(Ft){if(B)if(b.layerUpdates.size>0){let Rt=wc(wt.width,wt.height,b.format,b.type);for(let ut of b.layerUpdates){let Wt=wt.data.subarray(ut*Rt/wt.data.BYTES_PER_ELEMENT,(ut+1)*Rt/wt.data.BYTES_PER_ELEMENT);e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,rt,0,0,ut,wt.width,wt.height,1,At,Wt)}b.clearLayerUpdates()}else e.compressedTexSubImage3D(i.TEXTURE_2D_ARRAY,rt,0,0,0,wt.width,wt.height,at.depth,At,wt.data)}else e.compressedTexImage3D(i.TEXTURE_2D_ARRAY,rt,xt,wt.width,wt.height,at.depth,0,wt.data,0,0);else Jt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ft?B&&e.texSubImage3D(i.TEXTURE_2D_ARRAY,rt,0,0,0,wt.width,wt.height,at.depth,At,Ut,wt.data):e.texImage3D(i.TEXTURE_2D_ARRAY,rt,xt,wt.width,wt.height,at.depth,0,At,Ut,wt.data)}else{Ft&&Yt&&e.texStorage2D(i.TEXTURE_2D,Q,xt,Vt[0].width,Vt[0].height);for(let rt=0,Tt=Vt.length;rt<Tt;rt++)wt=Vt[rt],b.format!==Le?At!==null?Ft?B&&e.compressedTexSubImage2D(i.TEXTURE_2D,rt,0,0,wt.width,wt.height,At,wt.data):e.compressedTexImage2D(i.TEXTURE_2D,rt,xt,wt.width,wt.height,0,wt.data):Jt("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ft?B&&e.texSubImage2D(i.TEXTURE_2D,rt,0,0,wt.width,wt.height,At,Ut,wt.data):e.texImage2D(i.TEXTURE_2D,rt,xt,wt.width,wt.height,0,At,Ut,wt.data)}else if(b.isDataArrayTexture)if(Ft){if(Yt&&e.texStorage3D(i.TEXTURE_2D_ARRAY,Q,xt,at.width,at.height,at.depth),B)if(b.layerUpdates.size>0){let rt=wc(at.width,at.height,b.format,b.type);for(let Tt of b.layerUpdates){let Rt=at.data.subarray(Tt*rt/at.data.BYTES_PER_ELEMENT,(Tt+1)*rt/at.data.BYTES_PER_ELEMENT);e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,Tt,at.width,at.height,1,At,Ut,Rt)}b.clearLayerUpdates()}else e.texSubImage3D(i.TEXTURE_2D_ARRAY,0,0,0,0,at.width,at.height,at.depth,At,Ut,at.data)}else e.texImage3D(i.TEXTURE_2D_ARRAY,0,xt,at.width,at.height,at.depth,0,At,Ut,at.data);else if(b.isData3DTexture)Ft?(Yt&&e.texStorage3D(i.TEXTURE_3D,Q,xt,at.width,at.height,at.depth),B&&e.texSubImage3D(i.TEXTURE_3D,0,0,0,0,at.width,at.height,at.depth,At,Ut,at.data)):e.texImage3D(i.TEXTURE_3D,0,xt,at.width,at.height,at.depth,0,At,Ut,at.data);else if(b.isFramebufferTexture){if(Yt)if(Ft)e.texStorage2D(i.TEXTURE_2D,Q,xt,at.width,at.height);else{let rt=at.width,Tt=at.height;for(let Rt=0;Rt<Q;Rt++)e.texImage2D(i.TEXTURE_2D,Rt,xt,rt,Tt,0,At,Ut,null),rt>>=1,Tt>>=1}}else if(b.isHTMLTexture){if("texElementImage2D"in i){let rt=i.canvas;if(rt.hasAttribute("layoutsubtree")||rt.setAttribute("layoutsubtree","true"),at.parentNode!==rt){rt.appendChild(at),u.add(b),rt.onpaint=Tt=>{let Rt=Tt.changedElements;for(let ut of u)Rt.includes(ut.image)&&(ut.needsUpdate=!0)},rt.requestPaint();return}if(i.texElementImage2D.length===3)i.texElementImage2D(i.TEXTURE_2D,i.RGBA8,at);else{let Rt=i.RGBA,ut=i.RGBA,Wt=i.UNSIGNED_BYTE;i.texElementImage2D(i.TEXTURE_2D,0,Rt,ut,Wt,at)}i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,i.LINEAR),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE)}}else if(Vt.length>0){if(Ft&&Yt){let rt=ue(Vt[0]);e.texStorage2D(i.TEXTURE_2D,Q,xt,rt.width,rt.height)}for(let rt=0,Tt=Vt.length;rt<Tt;rt++)wt=Vt[rt],Ft?B&&e.texSubImage2D(i.TEXTURE_2D,rt,0,0,At,Ut,wt):e.texImage2D(i.TEXTURE_2D,rt,xt,At,Ut,wt);b.generateMipmaps=!1}else if(Ft){if(Yt){let rt=ue(at);e.texStorage2D(i.TEXTURE_2D,Q,xt,rt.width,rt.height)}B&&e.texSubImage2D(i.TEXTURE_2D,0,0,0,At,Ut,at)}else e.texImage2D(i.TEXTURE_2D,0,xt,At,Ut,at);_(b)&&R(j),Mt.__version=yt.version,b.onUpdate&&b.onUpdate(b)}U.__version=b.version}function Nt(U,b,X){if(b.image.length!==6)return;let j=tt(U,b),et=b.source;e.bindTexture(i.TEXTURE_CUBE_MAP,U.__webglTexture,i.TEXTURE0+X);let yt=n.get(et);if(et.version!==yt.__version||j===!0){e.activeTexture(i.TEXTURE0+X);let Mt=ce.getPrimaries(ce.workingColorSpace),it=b.colorSpace===Ye?null:ce.getPrimaries(b.colorSpace),at=b.colorSpace===Ye||Mt===it?i.NONE:i.BROWSER_DEFAULT_WEBGL;e.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,b.flipY),e.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),e.pixelStorei(i.UNPACK_ALIGNMENT,b.unpackAlignment),e.pixelStorei(i.UNPACK_COLORSPACE_CONVERSION_WEBGL,at);let At=b.isCompressedTexture||b.image[0].isCompressedTexture,Ut=b.image[0]&&b.image[0].isDataTexture,xt=[];for(let ut=0;ut<6;ut++)!At&&!Ut?xt[ut]=m(b.image[ut],!0,s.maxCubemapSize):xt[ut]=Ut?b.image[ut].image:b.image[ut],xt[ut]=Ke(b,xt[ut]);let wt=xt[0],Vt=r.convert(b.format,b.colorSpace),Ft=r.convert(b.type),Yt=v(b.internalFormat,Vt,Ft,b.normalized,b.colorSpace),B=b.isVideoTexture!==!0,Q=yt.__version===void 0||j===!0,rt=et.dataReady,Tt=C(b,wt);kt(i.TEXTURE_CUBE_MAP,b);let Rt;if(At){B&&Q&&e.texStorage2D(i.TEXTURE_CUBE_MAP,Tt,Yt,wt.width,wt.height);for(let ut=0;ut<6;ut++){Rt=xt[ut].mipmaps;for(let Wt=0;Wt<Rt.length;Wt++){let Gt=Rt[Wt];b.format!==Le?Vt!==null?B?rt&&e.compressedTexSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt,0,0,Gt.width,Gt.height,Vt,Gt.data):e.compressedTexImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt,Yt,Gt.width,Gt.height,0,Gt.data):Jt("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):B?rt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt,0,0,Gt.width,Gt.height,Vt,Ft,Gt.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt,Yt,Gt.width,Gt.height,0,Vt,Ft,Gt.data)}}}else{if(Rt=b.mipmaps,B&&Q){Rt.length>0&&Tt++;let ut=ue(xt[0]);e.texStorage2D(i.TEXTURE_CUBE_MAP,Tt,Yt,ut.width,ut.height)}for(let ut=0;ut<6;ut++)if(Ut){B?rt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,0,0,xt[ut].width,xt[ut].height,Vt,Ft,xt[ut].data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,Yt,xt[ut].width,xt[ut].height,0,Vt,Ft,xt[ut].data);for(let Wt=0;Wt<Rt.length;Wt++){let be=Rt[Wt].image[ut].image;B?rt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt+1,0,0,be.width,be.height,Vt,Ft,be.data):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt+1,Yt,be.width,be.height,0,Vt,Ft,be.data)}}else{B?rt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,0,0,Vt,Ft,xt[ut]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,0,Yt,Vt,Ft,xt[ut]);for(let Wt=0;Wt<Rt.length;Wt++){let Gt=Rt[Wt];B?rt&&e.texSubImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt+1,0,0,Vt,Ft,Gt.image[ut]):e.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+ut,Wt+1,Yt,Vt,Ft,Gt.image[ut])}}}_(b)&&R(i.TEXTURE_CUBE_MAP),yt.__version=et.version,b.onUpdate&&b.onUpdate(b)}U.__version=b.version}function Lt(U,b,X,j,et,yt){let Mt=r.convert(X.format,X.colorSpace),it=r.convert(X.type),at=v(X.internalFormat,Mt,it,X.normalized,X.colorSpace),At=n.get(b),Ut=n.get(X);if(Ut.__renderTarget=b,!At.__hasExternalTextures){let xt=Math.max(1,b.width>>yt),wt=Math.max(1,b.height>>yt);et===i.TEXTURE_3D||et===i.TEXTURE_2D_ARRAY?e.texImage3D(et,yt,at,xt,wt,b.depth,0,Mt,it,null):e.texImage2D(et,yt,at,xt,wt,0,Mt,it,null)}e.bindFramebuffer(i.FRAMEBUFFER,U),Re(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,j,et,Ut.__webglTexture,0,Se(b)):(et===i.TEXTURE_2D||et>=i.TEXTURE_CUBE_MAP_POSITIVE_X&&et<=i.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&i.framebufferTexture2D(i.FRAMEBUFFER,j,et,Ut.__webglTexture,yt),e.bindFramebuffer(i.FRAMEBUFFER,null)}function re(U,b,X){if(i.bindRenderbuffer(i.RENDERBUFFER,U),b.depthBuffer){let j=b.depthTexture,et=j&&j.isDepthTexture?j.type:null,yt=E(b.stencilBuffer,et),Mt=b.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;Re(b)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Se(b),yt,b.width,b.height):X?i.renderbufferStorageMultisample(i.RENDERBUFFER,Se(b),yt,b.width,b.height):i.renderbufferStorage(i.RENDERBUFFER,yt,b.width,b.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,Mt,i.RENDERBUFFER,U)}else{let j=b.textures;for(let et=0;et<j.length;et++){let yt=j[et],Mt=r.convert(yt.format,yt.colorSpace),it=r.convert(yt.type),at=v(yt.internalFormat,Mt,it,yt.normalized,yt.colorSpace);Re(b)?o.renderbufferStorageMultisampleEXT(i.RENDERBUFFER,Se(b),at,b.width,b.height):X?i.renderbufferStorageMultisample(i.RENDERBUFFER,Se(b),at,b.width,b.height):i.renderbufferStorage(i.RENDERBUFFER,at,b.width,b.height)}}i.bindRenderbuffer(i.RENDERBUFFER,null)}function Dt(U,b,X){let j=b.isWebGLCubeRenderTarget===!0;if(e.bindFramebuffer(i.FRAMEBUFFER,U),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");let et=n.get(b.depthTexture);if(et.__renderTarget=b,(!et.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),j){if(et.__webglInit===void 0&&(et.__webglInit=!0,b.depthTexture.addEventListener("dispose",D)),et.__webglTexture===void 0){et.__webglTexture=i.createTexture(),e.bindTexture(i.TEXTURE_CUBE_MAP,et.__webglTexture),kt(i.TEXTURE_CUBE_MAP,b.depthTexture);let At=r.convert(b.depthTexture.format),Ut=r.convert(b.depthTexture.type),xt;b.depthTexture.format===Vn?xt=i.DEPTH_COMPONENT24:b.depthTexture.format===Pi&&(xt=i.DEPTH24_STENCIL8);for(let wt=0;wt<6;wt++)i.texImage2D(i.TEXTURE_CUBE_MAP_POSITIVE_X+wt,0,xt,b.width,b.height,0,At,Ut,null)}}else st(b.depthTexture,0);let yt=et.__webglTexture,Mt=Se(b),it=j?i.TEXTURE_CUBE_MAP_POSITIVE_X+X:i.TEXTURE_2D,at=b.depthTexture.format===Pi?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;if(b.depthTexture.format===Vn)Re(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,at,it,yt,0,Mt):i.framebufferTexture2D(i.FRAMEBUFFER,at,it,yt,0);else if(b.depthTexture.format===Pi)Re(b)?o.framebufferTexture2DMultisampleEXT(i.FRAMEBUFFER,at,it,yt,0,Mt):i.framebufferTexture2D(i.FRAMEBUFFER,at,it,yt,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function $t(U){let b=n.get(U),X=U.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==U.depthTexture){let j=U.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),j){let et=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,j.removeEventListener("dispose",et)};j.addEventListener("dispose",et),b.__depthDisposeCallback=et}b.__boundDepthTexture=j}if(U.depthTexture&&!b.__autoAllocateDepthBuffer)if(X)for(let j=0;j<6;j++)Dt(b.__webglFramebuffer[j],U,j);else{let j=U.texture.mipmaps;j&&j.length>0?Dt(b.__webglFramebuffer[0],U,0):Dt(b.__webglFramebuffer,U,0)}else if(X){b.__webglDepthbuffer=[];for(let j=0;j<6;j++)if(e.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer[j]),b.__webglDepthbuffer[j]===void 0)b.__webglDepthbuffer[j]=i.createRenderbuffer(),re(b.__webglDepthbuffer[j],U,!1);else{let et=U.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,yt=b.__webglDepthbuffer[j];i.bindRenderbuffer(i.RENDERBUFFER,yt),i.framebufferRenderbuffer(i.FRAMEBUFFER,et,i.RENDERBUFFER,yt)}}else{let j=U.texture.mipmaps;if(j&&j.length>0?e.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer[0]):e.bindFramebuffer(i.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=i.createRenderbuffer(),re(b.__webglDepthbuffer,U,!1);else{let et=U.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,yt=b.__webglDepthbuffer;i.bindRenderbuffer(i.RENDERBUFFER,yt),i.framebufferRenderbuffer(i.FRAMEBUFFER,et,i.RENDERBUFFER,yt)}}e.bindFramebuffer(i.FRAMEBUFFER,null)}function Zt(U,b,X){let j=n.get(U);b!==void 0&&Lt(j.__webglFramebuffer,U,U.texture,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,0),X!==void 0&&$t(U)}function le(U){let b=U.texture,X=n.get(U),j=n.get(b);U.addEventListener("dispose",S);let et=U.textures,yt=U.isWebGLCubeRenderTarget===!0,Mt=et.length>1;if(Mt||(j.__webglTexture===void 0&&(j.__webglTexture=i.createTexture()),j.__version=b.version,a.memory.textures++),yt){X.__webglFramebuffer=[];for(let it=0;it<6;it++)if(b.mipmaps&&b.mipmaps.length>0){X.__webglFramebuffer[it]=[];for(let at=0;at<b.mipmaps.length;at++)X.__webglFramebuffer[it][at]=i.createFramebuffer()}else X.__webglFramebuffer[it]=i.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){X.__webglFramebuffer=[];for(let it=0;it<b.mipmaps.length;it++)X.__webglFramebuffer[it]=i.createFramebuffer()}else X.__webglFramebuffer=i.createFramebuffer();if(Mt)for(let it=0,at=et.length;it<at;it++){let At=n.get(et[it]);At.__webglTexture===void 0&&(At.__webglTexture=i.createTexture(),a.memory.textures++)}if(U.samples>0&&Re(U)===!1){X.__webglMultisampledFramebuffer=i.createFramebuffer(),X.__webglColorRenderbuffer=[],e.bindFramebuffer(i.FRAMEBUFFER,X.__webglMultisampledFramebuffer);for(let it=0;it<et.length;it++){let at=et[it];X.__webglColorRenderbuffer[it]=i.createRenderbuffer(),i.bindRenderbuffer(i.RENDERBUFFER,X.__webglColorRenderbuffer[it]);let At=r.convert(at.format,at.colorSpace),Ut=r.convert(at.type),xt=v(at.internalFormat,At,Ut,at.normalized,at.colorSpace,U.isXRRenderTarget===!0),wt=Se(U);i.renderbufferStorageMultisample(i.RENDERBUFFER,wt,xt,U.width,U.height),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+it,i.RENDERBUFFER,X.__webglColorRenderbuffer[it])}i.bindRenderbuffer(i.RENDERBUFFER,null),U.depthBuffer&&(X.__webglDepthRenderbuffer=i.createRenderbuffer(),re(X.__webglDepthRenderbuffer,U,!0)),e.bindFramebuffer(i.FRAMEBUFFER,null)}}if(yt){e.bindTexture(i.TEXTURE_CUBE_MAP,j.__webglTexture),kt(i.TEXTURE_CUBE_MAP,b);for(let it=0;it<6;it++)if(b.mipmaps&&b.mipmaps.length>0)for(let at=0;at<b.mipmaps.length;at++)Lt(X.__webglFramebuffer[it][at],U,b,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+it,at);else Lt(X.__webglFramebuffer[it],U,b,i.COLOR_ATTACHMENT0,i.TEXTURE_CUBE_MAP_POSITIVE_X+it,0);_(b)&&R(i.TEXTURE_CUBE_MAP),e.unbindTexture()}else if(Mt){for(let it=0,at=et.length;it<at;it++){let At=et[it],Ut=n.get(At),xt=i.TEXTURE_2D;(U.isWebGL3DRenderTarget||U.isWebGLArrayRenderTarget)&&(xt=U.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(xt,Ut.__webglTexture),kt(xt,At),Lt(X.__webglFramebuffer,U,At,i.COLOR_ATTACHMENT0+it,xt,0),_(At)&&R(xt)}e.unbindTexture()}else{let it=i.TEXTURE_2D;if((U.isWebGL3DRenderTarget||U.isWebGLArrayRenderTarget)&&(it=U.isWebGL3DRenderTarget?i.TEXTURE_3D:i.TEXTURE_2D_ARRAY),e.bindTexture(it,j.__webglTexture),kt(it,b),b.mipmaps&&b.mipmaps.length>0)for(let at=0;at<b.mipmaps.length;at++)Lt(X.__webglFramebuffer[at],U,b,i.COLOR_ATTACHMENT0,it,at);else Lt(X.__webglFramebuffer,U,b,i.COLOR_ATTACHMENT0,it,0);_(b)&&R(it),e.unbindTexture()}U.depthBuffer&&$t(U)}function Ce(U){let b=U.textures;for(let X=0,j=b.length;X<j;X++){let et=b[X];if(_(et)){let yt=w(U),Mt=n.get(et).__webglTexture;e.bindTexture(yt,Mt),R(yt),e.unbindTexture()}}}let Ie=[],De=[];function Ne(U){if(U.samples>0){if(Re(U)===!1){let b=U.textures,X=U.width,j=U.height,et=i.COLOR_BUFFER_BIT,yt=U.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT,Mt=n.get(U),it=b.length>1;if(it)for(let At=0;At<b.length;At++)e.bindFramebuffer(i.FRAMEBUFFER,Mt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+At,i.RENDERBUFFER,null),e.bindFramebuffer(i.FRAMEBUFFER,Mt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+At,i.TEXTURE_2D,null,0);e.bindFramebuffer(i.READ_FRAMEBUFFER,Mt.__webglMultisampledFramebuffer);let at=U.texture.mipmaps;at&&at.length>0?e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Mt.__webglFramebuffer[0]):e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Mt.__webglFramebuffer);for(let At=0;At<b.length;At++){if(U.resolveDepthBuffer&&(U.depthBuffer&&(et|=i.DEPTH_BUFFER_BIT),U.stencilBuffer&&U.resolveStencilBuffer&&(et|=i.STENCIL_BUFFER_BIT)),it){i.framebufferRenderbuffer(i.READ_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.RENDERBUFFER,Mt.__webglColorRenderbuffer[At]);let Ut=n.get(b[At]).__webglTexture;i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0,i.TEXTURE_2D,Ut,0)}i.blitFramebuffer(0,0,X,j,0,0,X,j,et,i.NEAREST),l===!0&&(Ie.length=0,De.length=0,Ie.push(i.COLOR_ATTACHMENT0+At),U.depthBuffer&&U.resolveDepthBuffer===!1&&(Ie.push(yt),De.push(yt),i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,De)),i.invalidateFramebuffer(i.READ_FRAMEBUFFER,Ie))}if(e.bindFramebuffer(i.READ_FRAMEBUFFER,null),e.bindFramebuffer(i.DRAW_FRAMEBUFFER,null),it)for(let At=0;At<b.length;At++){e.bindFramebuffer(i.FRAMEBUFFER,Mt.__webglMultisampledFramebuffer),i.framebufferRenderbuffer(i.FRAMEBUFFER,i.COLOR_ATTACHMENT0+At,i.RENDERBUFFER,Mt.__webglColorRenderbuffer[At]);let Ut=n.get(b[At]).__webglTexture;e.bindFramebuffer(i.FRAMEBUFFER,Mt.__webglFramebuffer),i.framebufferTexture2D(i.DRAW_FRAMEBUFFER,i.COLOR_ATTACHMENT0+At,i.TEXTURE_2D,Ut,0)}e.bindFramebuffer(i.DRAW_FRAMEBUFFER,Mt.__webglMultisampledFramebuffer)}else if(U.depthBuffer&&U.resolveDepthBuffer===!1&&l){let b=U.stencilBuffer?i.DEPTH_STENCIL_ATTACHMENT:i.DEPTH_ATTACHMENT;i.invalidateFramebuffer(i.DRAW_FRAMEBUFFER,[b])}}}function Se(U){return Math.min(s.maxSamples,U.samples)}function Re(U){let b=n.get(U);return U.samples>0&&t.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function V(U){let b=a.render.frame;f.get(U)!==b&&(f.set(U,b),U.update())}function Ke(U,b){let X=U.colorSpace,j=U.format,et=U.type;return U.isCompressedTexture===!0||U.isVideoTexture===!0||X!==pn&&X!==Ye&&(ce.getTransfer(X)===me?(j!==Le||et!==ln)&&Jt("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):jt("WebGLTextures: Unsupported texture color space:",X)),b}function ue(U){return typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement?(c.width=U.naturalWidth||U.width,c.height=U.naturalHeight||U.height):typeof VideoFrame<"u"&&U instanceof VideoFrame?(c.width=U.displayWidth,c.height=U.displayHeight):(c.width=U.width,c.height=U.height),c}this.allocateTextureUnit=K,this.resetTextureUnits=Y,this.getTextureUnits=J,this.setTextureUnits=O,this.setTexture2D=st,this.setTexture2DArray=lt,this.setTexture3D=St,this.setTextureCube=mt,this.rebindTextures=Zt,this.setupRenderTarget=le,this.updateRenderTargetMipmap=Ce,this.updateMultisampleRenderTarget=Ne,this.setupDepthRenderbuffer=$t,this.setupFrameBufferTexture=Lt,this.useMultisampledRTT=Re,this.isReversedDepthBuffer=function(){return e.buffers.depth.getReversed()}}function N_(i,t){function e(n,s=Ye){let r,a=ce.getTransfer(s);if(n===ln)return i.UNSIGNED_BYTE;if(n===_o)return i.UNSIGNED_SHORT_4_4_4_4;if(n===xo)return i.UNSIGNED_SHORT_5_5_5_1;if(n===dc)return i.UNSIGNED_INT_5_9_9_9_REV;if(n===pc)return i.UNSIGNED_INT_10F_11F_11F_REV;if(n===uc)return i.BYTE;if(n===fc)return i.SHORT;if(n===Gs)return i.UNSIGNED_SHORT;if(n===go)return i.INT;if(n===Un)return i.UNSIGNED_INT;if(n===qe)return i.FLOAT;if(n===en)return i.HALF_FLOAT;if(n===mc)return i.ALPHA;if(n===gc)return i.RGB;if(n===Le)return i.RGBA;if(n===Vn)return i.DEPTH_COMPONENT;if(n===Pi)return i.DEPTH_STENCIL;if(n===di)return i.RED;if(n===yo)return i.RED_INTEGER;if(n===cn)return i.RG;if(n===vo)return i.RG_INTEGER;if(n===So)return i.RGBA_INTEGER;if(n===Vr||n===Gr||n===Hr||n===Wr)if(a===me)if(r=t.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===Vr)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Gr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===Hr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===Wr)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=t.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===Vr)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Gr)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===Hr)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===Wr)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===Mo||n===bo||n===wo||n===Ao)if(r=t.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===Mo)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===bo)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===wo)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ao)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===To||n===Eo||n===Co||n===Ro||n===Po||n===Xr||n===Io)if(r=t.get("WEBGL_compressed_texture_etc"),r!==null){if(n===To||n===Eo)return a===me?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Co)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(n===Ro)return r.COMPRESSED_R11_EAC;if(n===Po)return r.COMPRESSED_SIGNED_R11_EAC;if(n===Xr)return r.COMPRESSED_RG11_EAC;if(n===Io)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(n===Do||n===Uo||n===Lo||n===No||n===Fo||n===Oo||n===Bo||n===ko||n===zo||n===Vo||n===Go||n===Ho||n===Wo||n===Xo)if(r=t.get("WEBGL_compressed_texture_astc"),r!==null){if(n===Do)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===Uo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===Lo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===No)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===Fo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===Oo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===Bo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ko)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===zo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===Vo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===Go)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===Ho)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===Wo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===Xo)return a===me?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===qo||n===Yo||n===Zo)if(r=t.get("EXT_texture_compression_bptc"),r!==null){if(n===qo)return a===me?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===Yo)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===Zo)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===Jo||n===Ko||n===qr||n===$o)if(r=t.get("EXT_texture_compression_rgtc"),r!==null){if(n===Jo)return r.COMPRESSED_RED_RGTC1_EXT;if(n===Ko)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===qr)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===$o)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Hs?i.UNSIGNED_INT_24_8:i[n]!==void 0?i[n]:null}return{convert:e}}var F_=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,O_=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,Hc=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(t,e){if(this.texture===null){let n=new Mr(t.texture);(t.depthNear!==e.depthNear||t.depthFar!==e.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=n}}getMesh(t){if(this.texture!==null&&this.mesh===null){let e=t.cameras[0].viewport,n=new _n({vertexShader:F_,fragmentShader:O_,uniforms:{depthColor:{value:this.texture},depthWidth:{value:e.z},depthHeight:{value:e.w}}});this.mesh=new ve(new Cr(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},Wc=class extends Rn{constructor(t,e){super();let n=this,s=null,r=1,a=null,o="local-floor",l=1,c=null,f=null,u=null,d=null,p=null,g=null,y=typeof XRWebGLBinding<"u",m=new Hc,_={},R=e.getContextAttributes(),w=null,v=null,E=[],C=[],D=new Kt,S=null,T=new Ge;T.viewport=new ge;let L=new Ge;L.viewport=new ge;let N=[T,L],F=new lo,Y=null,J=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(tt){let ot=E[tt];return ot===void 0&&(ot=new Rs,E[tt]=ot),ot.getTargetRaySpace()},this.getControllerGrip=function(tt){let ot=E[tt];return ot===void 0&&(ot=new Rs,E[tt]=ot),ot.getGripSpace()},this.getHand=function(tt){let ot=E[tt];return ot===void 0&&(ot=new Rs,E[tt]=ot),ot.getHandSpace()};function O(tt){let ot=C.indexOf(tt.inputSource);if(ot===-1)return;let ht=E[ot];ht!==void 0&&(ht.update(tt.inputSource,tt.frame,c||a),ht.dispatchEvent({type:tt.type,data:tt.inputSource}))}function K(){s.removeEventListener("select",O),s.removeEventListener("selectstart",O),s.removeEventListener("selectend",O),s.removeEventListener("squeeze",O),s.removeEventListener("squeezestart",O),s.removeEventListener("squeezeend",O),s.removeEventListener("end",K),s.removeEventListener("inputsourceschange",Z);for(let tt=0;tt<E.length;tt++){let ot=C[tt];ot!==null&&(C[tt]=null,E[tt].disconnect(ot))}Y=null,J=null,m.reset();for(let tt in _)delete _[tt];t.setRenderTarget(w),p=null,d=null,u=null,s=null,v=null,kt.stop(),n.isPresenting=!1,t.setPixelRatio(S),t.setSize(D.width,D.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(tt){r=tt,n.isPresenting===!0&&Jt("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(tt){o=tt,n.isPresenting===!0&&Jt("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(tt){c=tt},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u===null&&y&&(u=new XRWebGLBinding(s,e)),u},this.getFrame=function(){return g},this.getSession=function(){return s},this.setSession=async function(tt){if(s=tt,s!==null){if(w=t.getRenderTarget(),s.addEventListener("select",O),s.addEventListener("selectstart",O),s.addEventListener("selectend",O),s.addEventListener("squeeze",O),s.addEventListener("squeezestart",O),s.addEventListener("squeezeend",O),s.addEventListener("end",K),s.addEventListener("inputsourceschange",Z),R.xrCompatible!==!0&&await e.makeXRCompatible(),S=t.getPixelRatio(),t.getSize(D),y&&"createProjectionLayer"in XRWebGLBinding.prototype){let ht=null,gt=null,Nt=null;R.depth&&(Nt=R.stencil?e.DEPTH24_STENCIL8:e.DEPTH_COMPONENT24,ht=R.stencil?Pi:Vn,gt=R.stencil?Hs:Un);let Lt={colorFormat:e.RGBA8,depthFormat:Nt,scaleFactor:r};u=this.getBinding(),d=u.createProjectionLayer(Lt),s.updateRenderState({layers:[d]}),t.setPixelRatio(1),t.setSize(d.textureWidth,d.textureHeight,!1),v=new mn(d.textureWidth,d.textureHeight,{format:Le,type:ln,depthTexture:new li(d.textureWidth,d.textureHeight,gt,void 0,void 0,void 0,void 0,void 0,void 0,ht),stencilBuffer:R.stencil,colorSpace:t.outputColorSpace,samples:R.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let ht={antialias:R.antialias,alpha:!0,depth:R.depth,stencil:R.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(s,e,ht),s.updateRenderState({baseLayer:p}),t.setPixelRatio(1),t.setSize(p.framebufferWidth,p.framebufferHeight,!1),v=new mn(p.framebufferWidth,p.framebufferHeight,{format:Le,type:ln,colorSpace:t.outputColorSpace,stencilBuffer:R.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}v.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await s.requestReferenceSpace(o),kt.setContext(s),kt.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function Z(tt){for(let ot=0;ot<tt.removed.length;ot++){let ht=tt.removed[ot],gt=C.indexOf(ht);gt>=0&&(C[gt]=null,E[gt].disconnect(ht))}for(let ot=0;ot<tt.added.length;ot++){let ht=tt.added[ot],gt=C.indexOf(ht);if(gt===-1){for(let Lt=0;Lt<E.length;Lt++)if(Lt>=C.length){C.push(ht),gt=Lt;break}else if(C[Lt]===null){C[Lt]=ht,gt=Lt;break}if(gt===-1)break}let Nt=E[gt];Nt&&Nt.connect(ht)}}let st=new H,lt=new H;function St(tt,ot,ht){st.setFromMatrixPosition(ot.matrixWorld),lt.setFromMatrixPosition(ht.matrixWorld);let gt=st.distanceTo(lt),Nt=ot.projectionMatrix.elements,Lt=ht.projectionMatrix.elements,re=Nt[14]/(Nt[10]-1),Dt=Nt[14]/(Nt[10]+1),$t=(Nt[9]+1)/Nt[5],Zt=(Nt[9]-1)/Nt[5],le=(Nt[8]-1)/Nt[0],Ce=(Lt[8]+1)/Lt[0],Ie=re*le,De=re*Ce,Ne=gt/(-le+Ce),Se=Ne*-le;if(ot.matrixWorld.decompose(tt.position,tt.quaternion,tt.scale),tt.translateX(Se),tt.translateZ(Ne),tt.matrixWorld.compose(tt.position,tt.quaternion,tt.scale),tt.matrixWorldInverse.copy(tt.matrixWorld).invert(),Nt[10]===-1)tt.projectionMatrix.copy(ot.projectionMatrix),tt.projectionMatrixInverse.copy(ot.projectionMatrixInverse);else{let Re=re+Ne,V=Dt+Ne,Ke=Ie-Se,ue=De+(gt-Se),U=$t*Dt/V*Re,b=Zt*Dt/V*Re;tt.projectionMatrix.makePerspective(Ke,ue,U,b,Re,V),tt.projectionMatrixInverse.copy(tt.projectionMatrix).invert()}}function mt(tt,ot){ot===null?tt.matrixWorld.copy(tt.matrix):tt.matrixWorld.multiplyMatrices(ot.matrixWorld,tt.matrix),tt.matrixWorldInverse.copy(tt.matrixWorld).invert()}this.updateCamera=function(tt){if(s===null)return;let ot=tt.near,ht=tt.far;m.texture!==null&&(m.depthNear>0&&(ot=m.depthNear),m.depthFar>0&&(ht=m.depthFar)),F.near=L.near=T.near=ot,F.far=L.far=T.far=ht,(Y!==F.near||J!==F.far)&&(s.updateRenderState({depthNear:F.near,depthFar:F.far}),Y=F.near,J=F.far),F.layers.mask=tt.layers.mask|6,T.layers.mask=F.layers.mask&-5,L.layers.mask=F.layers.mask&-3;let gt=tt.parent,Nt=F.cameras;mt(F,gt);for(let Lt=0;Lt<Nt.length;Lt++)mt(Nt[Lt],gt);Nt.length===2?St(F,T,L):F.projectionMatrix.copy(T.projectionMatrix),vt(tt,F,gt)};function vt(tt,ot,ht){ht===null?tt.matrix.copy(ot.matrixWorld):(tt.matrix.copy(ht.matrixWorld),tt.matrix.invert(),tt.matrix.multiply(ot.matrixWorld)),tt.matrix.decompose(tt.position,tt.quaternion,tt.scale),tt.updateMatrixWorld(!0),tt.projectionMatrix.copy(ot.projectionMatrix),tt.projectionMatrixInverse.copy(ot.projectionMatrixInverse),tt.isPerspectiveCamera&&(tt.fov=Xi*2*Math.atan(1/tt.projectionMatrix.elements[5]),tt.zoom=1)}this.getCamera=function(){return F},this.getFoveation=function(){if(!(d===null&&p===null))return l},this.setFoveation=function(tt){l=tt,d!==null&&(d.fixedFoveation=tt),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=tt)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(F)},this.getCameraTexture=function(tt){return _[tt]};let qt=null;function Qt(tt,ot){if(f=ot.getViewerPose(c||a),g=ot,f!==null){let ht=f.views;p!==null&&(t.setRenderTargetFramebuffer(v,p.framebuffer),t.setRenderTarget(v));let gt=!1;ht.length!==F.cameras.length&&(F.cameras.length=0,gt=!0);for(let Dt=0;Dt<ht.length;Dt++){let $t=ht[Dt],Zt=null;if(p!==null)Zt=p.getViewport($t);else{let Ce=u.getViewSubImage(d,$t);Zt=Ce.viewport,Dt===0&&(t.setRenderTargetTextures(v,Ce.colorTexture,Ce.depthStencilTexture),t.setRenderTarget(v))}let le=N[Dt];le===void 0&&(le=new Ge,le.layers.enable(Dt),le.viewport=new ge,N[Dt]=le),le.matrix.fromArray($t.transform.matrix),le.matrix.decompose(le.position,le.quaternion,le.scale),le.projectionMatrix.fromArray($t.projectionMatrix),le.projectionMatrixInverse.copy(le.projectionMatrix).invert(),le.viewport.set(Zt.x,Zt.y,Zt.width,Zt.height),Dt===0&&(F.matrix.copy(le.matrix),F.matrix.decompose(F.position,F.quaternion,F.scale)),gt===!0&&F.cameras.push(le)}let Nt=s.enabledFeatures;if(Nt&&Nt.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&y){u=n.getBinding();let Dt=u.getDepthInformation(ht[0]);Dt&&Dt.isValid&&Dt.texture&&m.init(Dt,s.renderState)}if(Nt&&Nt.includes("camera-access")&&y){t.state.unbindTexture(),u=n.getBinding();for(let Dt=0;Dt<ht.length;Dt++){let $t=ht[Dt].camera;if($t){let Zt=_[$t];Zt||(Zt=new Mr,_[$t]=Zt);let le=u.getCameraImage($t);Zt.sourceTexture=le}}}}for(let ht=0;ht<E.length;ht++){let gt=C[ht],Nt=E[ht];gt!==null&&Nt!==void 0&&Nt.update(gt,ot,c||a)}qt&&qt(tt,ot),ot.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ot}),g=null}let kt=new of;kt.setAnimationLoop(Qt),this.setAnimationLoop=function(tt){qt=tt},this.dispose=function(){}}},B_=new se,df=new ne;df.set(-1,0,0,0,1,0,0,0,1);function k_(i,t){function e(m,_){m.matrixAutoUpdate===!0&&m.updateMatrix(),_.value.copy(m.matrix)}function n(m,_){_.color.getRGB(m.fogColor.value,Sc(i)),_.isFog?(m.fogNear.value=_.near,m.fogFar.value=_.far):_.isFogExp2&&(m.fogDensity.value=_.density)}function s(m,_,R,w,v){_.isNodeMaterial?_.uniformsNeedUpdate=!1:_.isMeshBasicMaterial?r(m,_):_.isMeshLambertMaterial?(r(m,_),_.envMap&&(m.envMapIntensity.value=_.envMapIntensity)):_.isMeshToonMaterial?(r(m,_),u(m,_)):_.isMeshPhongMaterial?(r(m,_),f(m,_),_.envMap&&(m.envMapIntensity.value=_.envMapIntensity)):_.isMeshStandardMaterial?(r(m,_),d(m,_),_.isMeshPhysicalMaterial&&p(m,_,v)):_.isMeshMatcapMaterial?(r(m,_),g(m,_)):_.isMeshDepthMaterial?r(m,_):_.isMeshDistanceMaterial?(r(m,_),y(m,_)):_.isMeshNormalMaterial?r(m,_):_.isLineBasicMaterial?(a(m,_),_.isLineDashedMaterial&&o(m,_)):_.isPointsMaterial?l(m,_,R,w):_.isSpriteMaterial?c(m,_):_.isShadowMaterial?(m.color.value.copy(_.color),m.opacity.value=_.opacity):_.isShaderMaterial&&(_.uniformsNeedUpdate=!1)}function r(m,_){m.opacity.value=_.opacity,_.color&&m.diffuse.value.copy(_.color),_.emissive&&m.emissive.value.copy(_.emissive).multiplyScalar(_.emissiveIntensity),_.map&&(m.map.value=_.map,e(_.map,m.mapTransform)),_.alphaMap&&(m.alphaMap.value=_.alphaMap,e(_.alphaMap,m.alphaMapTransform)),_.bumpMap&&(m.bumpMap.value=_.bumpMap,e(_.bumpMap,m.bumpMapTransform),m.bumpScale.value=_.bumpScale,_.side===Xe&&(m.bumpScale.value*=-1)),_.normalMap&&(m.normalMap.value=_.normalMap,e(_.normalMap,m.normalMapTransform),m.normalScale.value.copy(_.normalScale),_.side===Xe&&m.normalScale.value.negate()),_.displacementMap&&(m.displacementMap.value=_.displacementMap,e(_.displacementMap,m.displacementMapTransform),m.displacementScale.value=_.displacementScale,m.displacementBias.value=_.displacementBias),_.emissiveMap&&(m.emissiveMap.value=_.emissiveMap,e(_.emissiveMap,m.emissiveMapTransform)),_.specularMap&&(m.specularMap.value=_.specularMap,e(_.specularMap,m.specularMapTransform)),_.alphaTest>0&&(m.alphaTest.value=_.alphaTest);let R=t.get(_),w=R.envMap,v=R.envMapRotation;w&&(m.envMap.value=w,m.envMapRotation.value.setFromMatrix4(B_.makeRotationFromEuler(v)).transpose(),w.isCubeTexture&&w.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(df),m.reflectivity.value=_.reflectivity,m.ior.value=_.ior,m.refractionRatio.value=_.refractionRatio),_.lightMap&&(m.lightMap.value=_.lightMap,m.lightMapIntensity.value=_.lightMapIntensity,e(_.lightMap,m.lightMapTransform)),_.aoMap&&(m.aoMap.value=_.aoMap,m.aoMapIntensity.value=_.aoMapIntensity,e(_.aoMap,m.aoMapTransform))}function a(m,_){m.diffuse.value.copy(_.color),m.opacity.value=_.opacity,_.map&&(m.map.value=_.map,e(_.map,m.mapTransform))}function o(m,_){m.dashSize.value=_.dashSize,m.totalSize.value=_.dashSize+_.gapSize,m.scale.value=_.scale}function l(m,_,R,w){m.diffuse.value.copy(_.color),m.opacity.value=_.opacity,m.size.value=_.size*R,m.scale.value=w*.5,_.map&&(m.map.value=_.map,e(_.map,m.uvTransform)),_.alphaMap&&(m.alphaMap.value=_.alphaMap,e(_.alphaMap,m.alphaMapTransform)),_.alphaTest>0&&(m.alphaTest.value=_.alphaTest)}function c(m,_){m.diffuse.value.copy(_.color),m.opacity.value=_.opacity,m.rotation.value=_.rotation,_.map&&(m.map.value=_.map,e(_.map,m.mapTransform)),_.alphaMap&&(m.alphaMap.value=_.alphaMap,e(_.alphaMap,m.alphaMapTransform)),_.alphaTest>0&&(m.alphaTest.value=_.alphaTest)}function f(m,_){m.specular.value.copy(_.specular),m.shininess.value=Math.max(_.shininess,1e-4)}function u(m,_){_.gradientMap&&(m.gradientMap.value=_.gradientMap)}function d(m,_){m.metalness.value=_.metalness,_.metalnessMap&&(m.metalnessMap.value=_.metalnessMap,e(_.metalnessMap,m.metalnessMapTransform)),m.roughness.value=_.roughness,_.roughnessMap&&(m.roughnessMap.value=_.roughnessMap,e(_.roughnessMap,m.roughnessMapTransform)),_.envMap&&(m.envMapIntensity.value=_.envMapIntensity)}function p(m,_,R){m.ior.value=_.ior,_.sheen>0&&(m.sheenColor.value.copy(_.sheenColor).multiplyScalar(_.sheen),m.sheenRoughness.value=_.sheenRoughness,_.sheenColorMap&&(m.sheenColorMap.value=_.sheenColorMap,e(_.sheenColorMap,m.sheenColorMapTransform)),_.sheenRoughnessMap&&(m.sheenRoughnessMap.value=_.sheenRoughnessMap,e(_.sheenRoughnessMap,m.sheenRoughnessMapTransform))),_.clearcoat>0&&(m.clearcoat.value=_.clearcoat,m.clearcoatRoughness.value=_.clearcoatRoughness,_.clearcoatMap&&(m.clearcoatMap.value=_.clearcoatMap,e(_.clearcoatMap,m.clearcoatMapTransform)),_.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=_.clearcoatRoughnessMap,e(_.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),_.clearcoatNormalMap&&(m.clearcoatNormalMap.value=_.clearcoatNormalMap,e(_.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(_.clearcoatNormalScale),_.side===Xe&&m.clearcoatNormalScale.value.negate())),_.dispersion>0&&(m.dispersion.value=_.dispersion),_.iridescence>0&&(m.iridescence.value=_.iridescence,m.iridescenceIOR.value=_.iridescenceIOR,m.iridescenceThicknessMinimum.value=_.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=_.iridescenceThicknessRange[1],_.iridescenceMap&&(m.iridescenceMap.value=_.iridescenceMap,e(_.iridescenceMap,m.iridescenceMapTransform)),_.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=_.iridescenceThicknessMap,e(_.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),_.transmission>0&&(m.transmission.value=_.transmission,m.transmissionSamplerMap.value=R.texture,m.transmissionSamplerSize.value.set(R.width,R.height),_.transmissionMap&&(m.transmissionMap.value=_.transmissionMap,e(_.transmissionMap,m.transmissionMapTransform)),m.thickness.value=_.thickness,_.thicknessMap&&(m.thicknessMap.value=_.thicknessMap,e(_.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=_.attenuationDistance,m.attenuationColor.value.copy(_.attenuationColor)),_.anisotropy>0&&(m.anisotropyVector.value.set(_.anisotropy*Math.cos(_.anisotropyRotation),_.anisotropy*Math.sin(_.anisotropyRotation)),_.anisotropyMap&&(m.anisotropyMap.value=_.anisotropyMap,e(_.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=_.specularIntensity,m.specularColor.value.copy(_.specularColor),_.specularColorMap&&(m.specularColorMap.value=_.specularColorMap,e(_.specularColorMap,m.specularColorMapTransform)),_.specularIntensityMap&&(m.specularIntensityMap.value=_.specularIntensityMap,e(_.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,_){_.matcap&&(m.matcap.value=_.matcap)}function y(m,_){let R=t.get(_).light;m.referencePosition.value.setFromMatrixPosition(R.matrixWorld),m.nearDistance.value=R.shadow.camera.near,m.farDistance.value=R.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:s}}function z_(i,t,e,n){let s={},r={},a=[],o=i.getParameter(i.MAX_UNIFORM_BUFFER_BINDINGS);function l(v,E){let C=E.program;n.uniformBlockBinding(v,C)}function c(v,E){let C=s[v.id];C===void 0&&(m(v),C=f(v),s[v.id]=C,v.addEventListener("dispose",R));let D=E.program;n.updateUBOMapping(v,D);let S=t.render.frame;r[v.id]!==S&&(d(v),r[v.id]=S)}function f(v){let E=u();v.__bindingPointIndex=E;let C=i.createBuffer(),D=v.__size,S=v.usage;return i.bindBuffer(i.UNIFORM_BUFFER,C),i.bufferData(i.UNIFORM_BUFFER,D,S),i.bindBuffer(i.UNIFORM_BUFFER,null),i.bindBufferBase(i.UNIFORM_BUFFER,E,C),C}function u(){for(let v=0;v<o;v++)if(a.indexOf(v)===-1)return a.push(v),v;return jt("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(v){let E=s[v.id],C=v.uniforms,D=v.__cache;i.bindBuffer(i.UNIFORM_BUFFER,E);for(let S=0,T=C.length;S<T;S++){let L=C[S];if(Array.isArray(L))for(let N=0,F=L.length;N<F;N++)p(L[N],S,N,D);else p(L,S,0,D)}i.bindBuffer(i.UNIFORM_BUFFER,null)}function p(v,E,C,D){if(y(v,E,C,D)===!0){let S=v.__offset,T=v.value;if(Array.isArray(T)){let L=0;for(let N=0;N<T.length;N++){let F=T[N],Y=_(F);g(F,v.__data,L),typeof F!="number"&&typeof F!="boolean"&&!F.isMatrix3&&!ArrayBuffer.isView(F)&&(L+=Y.storage/Float32Array.BYTES_PER_ELEMENT)}}else g(T,v.__data,0);i.bufferSubData(i.UNIFORM_BUFFER,S,v.__data)}}function g(v,E,C){typeof v=="number"||typeof v=="boolean"?E[0]=v:v.isMatrix3?(E[0]=v.elements[0],E[1]=v.elements[1],E[2]=v.elements[2],E[3]=0,E[4]=v.elements[3],E[5]=v.elements[4],E[6]=v.elements[5],E[7]=0,E[8]=v.elements[6],E[9]=v.elements[7],E[10]=v.elements[8],E[11]=0):ArrayBuffer.isView(v)?E.set(new v.constructor(v.buffer,v.byteOffset,E.length)):v.toArray(E,C)}function y(v,E,C,D){let S=v.value,T=E+"_"+C;if(D[T]===void 0)return typeof S=="number"||typeof S=="boolean"?D[T]=S:ArrayBuffer.isView(S)?D[T]=S.slice():D[T]=S.clone(),!0;{let L=D[T];if(typeof S=="number"||typeof S=="boolean"){if(L!==S)return D[T]=S,!0}else{if(ArrayBuffer.isView(S))return!0;if(L.equals(S)===!1)return L.copy(S),!0}}return!1}function m(v){let E=v.uniforms,C=0,D=16;for(let T=0,L=E.length;T<L;T++){let N=Array.isArray(E[T])?E[T]:[E[T]];for(let F=0,Y=N.length;F<Y;F++){let J=N[F],O=Array.isArray(J.value)?J.value:[J.value];for(let K=0,Z=O.length;K<Z;K++){let st=O[K],lt=_(st),St=C%D,mt=St%lt.boundary,vt=St+mt;C+=mt,vt!==0&&D-vt<lt.storage&&(C+=D-vt),J.__data=new Float32Array(lt.storage/Float32Array.BYTES_PER_ELEMENT),J.__offset=C,C+=lt.storage}}}let S=C%D;return S>0&&(C+=D-S),v.__size=C,v.__cache={},this}function _(v){let E={boundary:0,storage:0};return typeof v=="number"||typeof v=="boolean"?(E.boundary=4,E.storage=4):v.isVector2?(E.boundary=8,E.storage=8):v.isVector3||v.isColor?(E.boundary=16,E.storage=12):v.isVector4?(E.boundary=16,E.storage=16):v.isMatrix3?(E.boundary=48,E.storage=48):v.isMatrix4?(E.boundary=64,E.storage=64):v.isTexture?Jt("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(v)?(E.boundary=16,E.storage=v.byteLength):Jt("WebGLRenderer: Unsupported uniform value type.",v),E}function R(v){let E=v.target;E.removeEventListener("dispose",R);let C=a.indexOf(E.__bindingPointIndex);a.splice(C,1),i.deleteBuffer(s[E.id]),delete s[E.id],delete r[E.id]}function w(){for(let v in s)i.deleteBuffer(s[v]);a=[],s={},r={}}return{bind:l,update:c,dispose:w}}var V_=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]),qn=null;function G_(){return qn===null&&(qn=new wi(V_,16,16,cn,en),qn.name="DFG_LUT",qn.minFilter=Te,qn.magFilter=Te,qn.wrapS=an,qn.wrapT=an,qn.generateMipmaps=!1,qn.needsUpdate=!0),qn}var Xc=class{constructor(t={}){let{canvas:e=Eu(),context:n=null,depth:s=!0,stencil:r=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:f="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:d=!1,outputBufferType:p=ln}=t;this.isWebGLRenderer=!0;let g;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");g=n.getContextAttributes().alpha}else g=a;let y=p,m=new Set([So,vo,yo]),_=new Set([ln,Un,Gs,Hs,_o,xo]),R=new Uint32Array(4),w=new Int32Array(4),v=new H,E=null,C=null,D=[],S=[],T=null;this.domElement=e,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Dn,this.toneMappingExposure=1,this.transmissionResolutionScale=1;let L=this,N=!1,F=null,Y=null,J=null,O=null;this._outputColorSpace=pe;let K=0,Z=0,st=null,lt=-1,St=null,mt=new ge,vt=new ge,qt=null,Qt=new ie(0),kt=0,tt=e.width,ot=e.height,ht=1,gt=null,Nt=null,Lt=new ge(0,0,tt,ot),re=new ge(0,0,tt,ot),Dt=!1,$t=new Ds,Zt=!1,le=!1,Ce=new se,Ie=new H,De=new ge,Ne={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},Se=!1;function Re(){return st===null?ht:1}let V=n;function Ke(h,x){return e.getContext(h,x)}try{let h={alpha:!0,depth:s,stencil:r,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:f,failIfMajorPerformanceCaveat:u};if("setAttribute"in e&&e.setAttribute("data-engine",`three.js r${"185"}`),e.addEventListener("webglcontextlost",be,!1),e.addEventListener("webglcontextrestored",_e,!1),e.addEventListener("webglcontextcreationerror",yn,!1),V===null){let x="webgl2";if(V=Ke(x,h),V===null)throw Ke(x)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(h){throw jt("WebGLRenderer: "+h.message),h}let ue,U,b,X,j,et,yt,Mt,it,at,At,Ut,xt,wt,Vt,Ft,Yt,B,Q,rt,Tt,Rt,ut;function Wt(){ue=new Jg(V),ue.init(),Tt=new N_(V,ue),U=new Vg(V,ue,t,Tt),b=new U_(V,ue),U.reversedDepthBuffer&&d&&b.buffers.depth.setReversed(!0),Y=V.createFramebuffer(),J=V.createFramebuffer(),O=V.createFramebuffer(),X=new jg(V),j=new y_,et=new L_(V,ue,b,j,U,Tt,X),yt=new Zg(L),Mt=new np(V),Rt=new kg(V,Mt),it=new Kg(V,Mt,X,Rt),at=new t0(V,it,Mt,Rt,X),B=new Qg(V,U,et),Vt=new Gg(j),At=new x_(L,yt,ue,U,Rt,Vt),Ut=new k_(L,j),xt=new S_,wt=new E_(ue),Yt=new Bg(L,yt,b,at,g,l),Ft=new D_(L,at,U),ut=new z_(V,X,U,b),Q=new zg(V,ue,X),rt=new $g(V,ue,X),X.programs=At.programs,L.capabilities=U,L.extensions=ue,L.properties=j,L.renderLists=xt,L.shadowMap=Ft,L.state=b,L.info=X}Wt(),y!==ln&&(T=new n0(y,e.width,e.height,o,s,r));let Gt=new Wc(L,V);this.xr=Gt,this.getContext=function(){return V},this.getContextAttributes=function(){return V.getContextAttributes()},this.forceContextLoss=function(){let h=ue.get("WEBGL_lose_context");h&&h.loseContext()},this.forceContextRestore=function(){let h=ue.get("WEBGL_lose_context");h&&h.restoreContext()},this.getPixelRatio=function(){return ht},this.setPixelRatio=function(h){h!==void 0&&(ht=h,this.setSize(tt,ot,!1))},this.getSize=function(h){return h.set(tt,ot)},this.setSize=function(h,x,M=!0){if(Gt.isPresenting){Jt("WebGLRenderer: Can't change size while VR device is presenting.");return}tt=h,ot=x,e.width=Math.floor(h*ht),e.height=Math.floor(x*ht),M===!0&&(e.style.width=h+"px",e.style.height=x+"px"),T!==null&&T.setSize(e.width,e.height),this.setViewport(0,0,h,x)},this.getDrawingBufferSize=function(h){return h.set(tt*ht,ot*ht).floor()},this.setDrawingBufferSize=function(h,x,M){tt=h,ot=x,ht=M,e.width=Math.floor(h*M),e.height=Math.floor(x*M),this.setViewport(0,0,h,x)},this.setEffects=function(h){if(y===ln){jt("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(h){for(let x=0;x<h.length;x++)if(h[x].isOutputPass===!0){Jt("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}T.setEffects(h||[])},this.getCurrentViewport=function(h){return h.copy(mt)},this.getViewport=function(h){return h.copy(Lt)},this.setViewport=function(h,x,M,A){h.isVector4?Lt.set(h.x,h.y,h.z,h.w):Lt.set(h,x,M,A),b.viewport(mt.copy(Lt).multiplyScalar(ht).round())},this.getScissor=function(h){return h.copy(re)},this.setScissor=function(h,x,M,A){h.isVector4?re.set(h.x,h.y,h.z,h.w):re.set(h,x,M,A),b.scissor(vt.copy(re).multiplyScalar(ht).round())},this.getScissorTest=function(){return Dt},this.setScissorTest=function(h){b.setScissorTest(Dt=h)},this.setOpaqueSort=function(h){gt=h},this.setTransparentSort=function(h){Nt=h},this.getClearColor=function(h){return h.copy(Yt.getClearColor())},this.setClearColor=function(){Yt.setClearColor(...arguments)},this.getClearAlpha=function(){return Yt.getClearAlpha()},this.setClearAlpha=function(){Yt.setClearAlpha(...arguments)},this.clear=function(h=!0,x=!0,M=!0){let A=0;if(h){let P=!1;if(st!==null){let k=st.texture.format;P=m.has(k)}if(P){let k=st.texture.type,I=_.has(k),z=Yt.getClearColor(),G=Yt.getClearAlpha(),W=z.r,$=z.g,nt=z.b;I?(R[0]=W,R[1]=$,R[2]=nt,R[3]=G,V.clearBufferuiv(V.COLOR,0,R)):(w[0]=W,w[1]=$,w[2]=nt,w[3]=G,V.clearBufferiv(V.COLOR,0,w))}else A|=V.COLOR_BUFFER_BIT}x&&(A|=V.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),M&&(A|=V.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),A!==0&&V.clear(A)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(h){h.setRenderer(this),F=h},this.dispose=function(){e.removeEventListener("webglcontextlost",be,!1),e.removeEventListener("webglcontextrestored",_e,!1),e.removeEventListener("webglcontextcreationerror",yn,!1),Yt.dispose(),xt.dispose(),wt.dispose(),j.dispose(),yt.dispose(),at.dispose(),Rt.dispose(),ut.dispose(),At.dispose(),Gt.dispose(),Gt.removeEventListener("sessionstart",sa),Gt.removeEventListener("sessionend",ra),Kn.stop()};function be(h){h.preventDefault(),xc("WebGLRenderer: Context Lost."),N=!0}function _e(){xc("WebGLRenderer: Context Restored."),N=!1;let h=X.autoReset,x=Ft.enabled,M=Ft.autoUpdate,A=Ft.needsUpdate,P=Ft.type;Wt(),X.autoReset=h,Ft.enabled=x,Ft.autoUpdate=M,Ft.needsUpdate=A,Ft.type=P}function yn(h){jt("WebGLRenderer: A WebGL context could not be created. Reason: ",h.statusMessage)}function vn(h){let x=h.target;x.removeEventListener("dispose",vn),ul(x)}function ul(h){fl(h),j.remove(h)}function fl(h){let x=j.get(h).programs;x!==void 0&&(x.forEach(function(M){At.releaseProgram(M)}),h.isShaderMaterial&&At.releaseShaderCache(h))}this.renderBufferDirect=function(h,x,M,A,P,k){x===null&&(x=Ne);let I=P.isMesh&&P.matrixWorld.determinantAffine()<0,z=ca(h,x,M,A,P);b.setMaterial(A,I);let G=M.index,W=1;if(A.wireframe===!0){if(G=it.getWireframeAttribute(M),G===void 0)return;W=2}let $=M.drawRange,nt=M.attributes.position,q=$.start*W,ct=($.start+$.count)*W;k!==null&&(q=Math.max(q,k.start*W),ct=Math.min(ct,(k.start+k.count)*W)),G!==null?(q=Math.max(q,0),ct=Math.min(ct,G.count)):nt!=null&&(q=Math.max(q,0),ct=Math.min(ct,nt.count));let _t=ct-q;if(_t<0||_t===1/0)return;Rt.setup(P,A,z,M,G);let ft,pt=Q;if(G!==null&&(ft=Mt.get(G),pt=rt,pt.setIndex(ft)),P.isMesh)A.wireframe===!0?(b.setLineWidth(A.wireframeLinewidth*Re()),pt.setMode(V.LINES)):pt.setMode(V.TRIANGLES);else if(P.isLine){let Pt=A.linewidth;Pt===void 0&&(Pt=1),b.setLineWidth(Pt*Re()),P.isLineSegments?pt.setMode(V.LINES):P.isLineLoop?pt.setMode(V.LINE_LOOP):pt.setMode(V.LINE_STRIP)}else P.isPoints?pt.setMode(V.POINTS):P.isSprite&&pt.setMode(V.TRIANGLES);if(P.isBatchedMesh)if(ue.get("WEBGL_multi_draw"))pt.renderMultiDraw(P._multiDrawStarts,P._multiDrawCounts,P._multiDrawCount);else{let Pt=P._multiDrawStarts,dt=P._multiDrawCounts,Xt=P._multiDrawCount,Ot=G?Mt.get(G).bytesPerElement:1,It=j.get(A).currentProgram.getUniforms();for(let bt=0;bt<Xt;bt++)It.setValue(V,"_gl_DrawID",bt),pt.render(Pt[bt]/Ot,dt[bt])}else if(P.isInstancedMesh)pt.renderInstances(q,_t,P.count);else if(M.isInstancedBufferGeometry){let Pt=M._maxInstanceCount!==void 0?M._maxInstanceCount:1/0,dt=Math.min(M.instanceCount,Pt);pt.renderInstances(q,_t,dt)}else pt.render(q,_t)};function na(h,x,M){h.transparent===!0&&h.side===Wn&&h.forceSinglePass===!1?(h.side=Xe,h.needsUpdate=!0,$n(h,x,M),h.side=ai,h.needsUpdate=!0,$n(h,x,M),h.side=Wn):$n(h,x,M)}this.compile=function(h,x,M=null){M===null&&(M=h),C=wt.get(M),C.init(x),S.push(C),M.traverseVisible(function(P){P.isLight&&P.layers.test(x.layers)&&(C.pushLight(P),P.castShadow&&C.pushShadow(P))}),h!==M&&h.traverseVisible(function(P){P.isLight&&P.layers.test(x.layers)&&(C.pushLight(P),P.castShadow&&C.pushShadow(P))}),C.setupLights();let A=new Set;return h.traverse(function(P){if(!(P.isMesh||P.isPoints||P.isLine||P.isSprite))return;let k=P.material;if(k)if(Array.isArray(k))for(let I=0;I<k.length;I++){let z=k[I];na(z,M,P),A.add(z)}else na(k,M,P),A.add(k)}),C=S.pop(),A},this.compileAsync=function(h,x,M=null){let A=this.compile(h,x,M);return new Promise(P=>{function k(){if(A.forEach(function(I){j.get(I).currentProgram.isReady()&&A.delete(I)}),A.size===0){P(h);return}setTimeout(k,10)}ue.get("KHR_parallel_shader_compile")!==null?k():setTimeout(k,10)})};let Js=null;function ia(h){Js&&Js(h)}function sa(){Kn.stop()}function ra(){Kn.start()}let Kn=new of;Kn.setAnimationLoop(ia),typeof self<"u"&&Kn.setContext(self),this.setAnimationLoop=function(h){Js=h,Gt.setAnimationLoop(h),h===null?Kn.stop():Kn.start()},Gt.addEventListener("sessionstart",sa),Gt.addEventListener("sessionend",ra),this.render=function(h,x){if(x!==void 0&&x.isCamera!==!0){jt("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(N===!0)return;F!==null&&F.renderStart(h,x);let M=Gt.enabled===!0&&Gt.isPresenting===!0,A=T!==null&&(st===null||M)&&T.begin(L,st);if(h.matrixWorldAutoUpdate===!0&&h.updateMatrixWorld(),x.parent===null&&x.matrixWorldAutoUpdate===!0&&x.updateMatrixWorld(),Gt.enabled===!0&&Gt.isPresenting===!0&&(T===null||T.isCompositing()===!1)&&(Gt.cameraAutoUpdate===!0&&Gt.updateCamera(x),x=Gt.getCamera()),h.isScene===!0&&h.onBeforeRender(L,h,x,st),C=wt.get(h,S.length),C.init(x),C.state.textureUnits=et.getTextureUnits(),S.push(C),Ce.multiplyMatrices(x.projectionMatrix,x.matrixWorldInverse),$t.setFromProjectionMatrix(Ce,Cn,x.reversedDepth),le=this.localClippingEnabled,Zt=Vt.init(this.clippingPlanes,le),E=xt.get(h,D.length),E.init(),D.push(E),Gt.enabled===!0&&Gt.isPresenting===!0){let I=L.xr.getDepthSensingMesh();I!==null&&rs(I,x,-1/0,L.sortObjects)}rs(h,x,0,L.sortObjects),E.finish(),L.sortObjects===!0&&E.sort(gt,Nt,x.reversedDepth),Se=Gt.enabled===!1||Gt.isPresenting===!1||Gt.hasDepthSensing()===!1,Se&&Yt.addToRenderList(E,h),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Zt===!0&&Vt.beginShadows();let P=C.state.shadowsArray;if(Ft.render(P,h,x),Zt===!0&&Vt.endShadows(),(A&&T.hasRenderPass())===!1){let I=E.opaque,z=E.transmissive;if(C.setupLights(),x.isArrayCamera){let G=x.cameras;if(z.length>0)for(let W=0,$=G.length;W<$;W++){let nt=G[W];Ks(I,z,h,nt)}Se&&Yt.render(h);for(let W=0,$=G.length;W<$;W++){let nt=G[W];aa(E,h,nt,nt.viewport)}}else z.length>0&&Ks(I,z,h,x),Se&&Yt.render(h),aa(E,h,x)}st!==null&&Z===0&&(et.updateMultisampleRenderTarget(st),et.updateRenderTargetMipmap(st)),A&&T.end(L),h.isScene===!0&&h.onAfterRender(L,h,x),Rt.resetDefaultState(),lt=-1,St=null,S.pop(),S.length>0?(C=S[S.length-1],et.setTextureUnits(C.state.textureUnits),Zt===!0&&Vt.setGlobalState(L.clippingPlanes,C.state.camera)):C=null,D.pop(),D.length>0?E=D[D.length-1]:E=null,F!==null&&F.renderEnd()};function rs(h,x,M,A){if(h.visible===!1)return;if(h.layers.test(x.layers)){if(h.isGroup)M=h.renderOrder;else if(h.isLOD)h.autoUpdate===!0&&h.update(x);else if(h.isLightProbeGrid)C.pushLightProbeGrid(h);else if(h.isLight)C.pushLight(h),h.castShadow&&C.pushShadow(h);else if(h.isSprite){if(!h.frustumCulled||$t.intersectsSprite(h)){A&&De.setFromMatrixPosition(h.matrixWorld).applyMatrix4(Ce);let I=at.update(h),z=h.material;z.visible&&E.push(h,I,z,M,De.z,null)}}else if((h.isMesh||h.isLine||h.isPoints)&&(!h.frustumCulled||$t.intersectsObject(h))){let I=at.update(h),z=h.material;if(A&&(h.boundingSphere!==void 0?(h.boundingSphere===null&&h.computeBoundingSphere(),De.copy(h.boundingSphere.center)):(I.boundingSphere===null&&I.computeBoundingSphere(),De.copy(I.boundingSphere.center)),De.applyMatrix4(h.matrixWorld).applyMatrix4(Ce)),Array.isArray(z)){let G=I.groups;for(let W=0,$=G.length;W<$;W++){let nt=G[W],q=z[nt.materialIndex];q&&q.visible&&E.push(h,I,q,M,De.z,nt)}}else z.visible&&E.push(h,I,z,M,De.z,null)}}let k=h.children;for(let I=0,z=k.length;I<z;I++)rs(k[I],x,M,A)}function aa(h,x,M,A){let{opaque:P,transmissive:k,transparent:I}=h;C.setupLightsView(M),Zt===!0&&Vt.setGlobalState(L.clippingPlanes,M),A&&b.viewport(mt.copy(A)),P.length>0&&as(P,x,M),k.length>0&&as(k,x,M),I.length>0&&as(I,x,M),b.buffers.depth.setTest(!0),b.buffers.depth.setMask(!0),b.buffers.color.setMask(!0),b.setPolygonOffset(!1)}function Ks(h,x,M,A){if((M.isScene===!0?M.overrideMaterial:null)!==null)return;if(C.state.transmissionRenderTarget[A.id]===void 0){let q=ue.has("EXT_color_buffer_half_float")||ue.has("EXT_color_buffer_float");C.state.transmissionRenderTarget[A.id]=new mn(1,1,{generateMipmaps:!0,type:q?en:ln,minFilter:fi,samples:Math.max(4,U.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ce.workingColorSpace})}let k=C.state.transmissionRenderTarget[A.id],I=A.viewport||mt;k.setSize(I.z*L.transmissionResolutionScale,I.w*L.transmissionResolutionScale);let z=L.getRenderTarget(),G=L.getActiveCubeFace(),W=L.getActiveMipmapLevel();L.setRenderTarget(k),L.getClearColor(Qt),kt=L.getClearAlpha(),kt<1&&L.setClearColor(16777215,.5),L.clear(),Se&&Yt.render(M);let $=L.toneMapping;L.toneMapping=Dn;let nt=A.viewport;if(A.viewport!==void 0&&(A.viewport=void 0),C.setupLightsView(A),Zt===!0&&Vt.setGlobalState(L.clippingPlanes,A),as(h,M,A),et.updateMultisampleRenderTarget(k),et.updateRenderTargetMipmap(k),ue.has("WEBGL_multisampled_render_to_texture")===!1){let q=!1;for(let ct=0,_t=x.length;ct<_t;ct++){let ft=x[ct],{object:pt,geometry:Pt,material:dt,group:Xt}=ft;if(dt.side===Wn&&pt.layers.test(A.layers)){let Ot=dt.side;dt.side=Xe,dt.needsUpdate=!0,oa(pt,M,A,Pt,dt,Xt),dt.side=Ot,dt.needsUpdate=!0,q=!0}}q===!0&&(et.updateMultisampleRenderTarget(k),et.updateRenderTargetMipmap(k))}L.setRenderTarget(z,G,W),L.setClearColor(Qt,kt),nt!==void 0&&(A.viewport=nt),L.toneMapping=$}function as(h,x,M){let A=x.isScene===!0?x.overrideMaterial:null;for(let P=0,k=h.length;P<k;P++){let I=h[P],{object:z,geometry:G,group:W}=I,$=I.material;$.allowOverride===!0&&A!==null&&($=A),z.layers.test(M.layers)&&oa(z,x,M,G,$,W)}}function oa(h,x,M,A,P,k){h.onBeforeRender(L,x,M,A,P,k),h.modelViewMatrix.multiplyMatrices(M.matrixWorldInverse,h.matrixWorld),h.normalMatrix.getNormalMatrix(h.modelViewMatrix),P.onBeforeRender(L,x,M,A,h,k),P.transparent===!0&&P.side===Wn&&P.forceSinglePass===!1?(P.side=Xe,P.needsUpdate=!0,L.renderBufferDirect(M,x,A,P,h,k),P.side=ai,P.needsUpdate=!0,L.renderBufferDirect(M,x,A,P,h,k),P.side=Wn):L.renderBufferDirect(M,x,A,P,h,k),h.onAfterRender(L,x,M,A,P,k)}function $n(h,x,M){x.isScene!==!0&&(x=Ne);let A=j.get(h),P=C.state.lights,k=C.state.shadowsArray,I=P.state.version,z=At.getParameters(h,P.state,k,x,M,C.state.lightProbeGridArray),G=At.getProgramCacheKey(z),W=A.programs;A.environment=h.isMeshStandardMaterial||h.isMeshLambertMaterial||h.isMeshPhongMaterial?x.environment:null,A.fog=x.fog;let $=h.isMeshStandardMaterial||h.isMeshLambertMaterial&&!h.envMap||h.isMeshPhongMaterial&&!h.envMap;A.envMap=yt.get(h.envMap||A.environment,$),A.envMapRotation=A.environment!==null&&h.envMap===null?x.environmentRotation:h.envMapRotation,W===void 0&&(h.addEventListener("dispose",vn),W=new Map,A.programs=W);let nt=W.get(G);if(nt!==void 0){if(A.currentProgram===nt&&A.lightsStateVersion===I)return la(h,z),nt}else z.uniforms=At.getUniforms(h),F!==null&&h.isNodeMaterial&&F.build(h,M,z),h.onBeforeCompile(z,L),nt=At.acquireProgram(z,G),W.set(G,nt),A.uniforms=z.uniforms;let q=A.uniforms;return(!h.isShaderMaterial&&!h.isRawShaderMaterial||h.clipping===!0)&&(q.clippingPlanes=Vt.uniform),la(h,z),A.needsLights=rn(h),A.lightsStateVersion=I,A.needsLights&&(q.ambientLightColor.value=P.state.ambient,q.lightProbe.value=P.state.probe,q.directionalLights.value=P.state.directional,q.directionalLightShadows.value=P.state.directionalShadow,q.spotLights.value=P.state.spot,q.spotLightShadows.value=P.state.spotShadow,q.rectAreaLights.value=P.state.rectArea,q.ltc_1.value=P.state.rectAreaLTC1,q.ltc_2.value=P.state.rectAreaLTC2,q.pointLights.value=P.state.point,q.pointLightShadows.value=P.state.pointShadow,q.hemisphereLights.value=P.state.hemi,q.directionalShadowMatrix.value=P.state.directionalShadowMatrix,q.spotLightMatrix.value=P.state.spotLightMatrix,q.spotLightMap.value=P.state.spotLightMap,q.pointShadowMatrix.value=P.state.pointShadowMatrix),A.lightProbeGrid=C.state.lightProbeGridArray.length>0,A.currentProgram=nt,A.uniformsList=null,nt}function Li(h){if(h.uniformsList===null){let x=h.currentProgram.getUniforms();h.uniformsList=Xs.seqWithValue(x.seq,h.uniforms)}return h.uniformsList}function la(h,x){let M=j.get(h);M.outputColorSpace=x.outputColorSpace,M.batching=x.batching,M.batchingColor=x.batchingColor,M.instancing=x.instancing,M.instancingColor=x.instancingColor,M.instancingMorph=x.instancingMorph,M.skinning=x.skinning,M.morphTargets=x.morphTargets,M.morphNormals=x.morphNormals,M.morphColors=x.morphColors,M.morphTargetsCount=x.morphTargetsCount,M.numClippingPlanes=x.numClippingPlanes,M.numIntersection=x.numClipIntersection,M.vertexAlphas=x.vertexAlphas,M.vertexTangents=x.vertexTangents,M.toneMapping=x.toneMapping}function os(h,x){if(h.length===0)return null;if(h.length===1)return h[0].texture!==null?h[0]:null;v.setFromMatrixPosition(x.matrixWorld);for(let M=0,A=h.length;M<A;M++){let P=h[M];if(P.texture!==null&&P.boundingBox.containsPoint(v))return P}return null}function ca(h,x,M,A,P){x.isScene!==!0&&(x=Ne),et.resetTextureUnits();let k=x.fog,I=A.isMeshStandardMaterial||A.isMeshLambertMaterial||A.isMeshPhongMaterial?x.environment:null,z=st===null?L.outputColorSpace:st.isXRRenderTarget===!0?st.texture.colorSpace:ce.workingColorSpace,G=A.isMeshStandardMaterial||A.isMeshLambertMaterial&&!A.envMap||A.isMeshPhongMaterial&&!A.envMap,W=yt.get(A.envMap||I,G),$=A.vertexColors===!0&&!!M.attributes.color&&M.attributes.color.itemSize===4,nt=!!M.attributes.tangent&&(!!A.normalMap||A.anisotropy>0),q=!!M.morphAttributes.position,ct=!!M.morphAttributes.normal,_t=!!M.morphAttributes.color,ft=Dn;A.toneMapped&&(st===null||st.isXRRenderTarget===!0)&&(ft=L.toneMapping);let pt=M.morphAttributes.position||M.morphAttributes.normal||M.morphAttributes.color,Pt=pt!==void 0?pt.length:0,dt=j.get(A),Xt=C.state.lights;if(Zt===!0&&(le===!0||h!==St)){let te=h===St&&A.id===lt;Vt.setState(A,h,te)}let Ot=!1;A.version===dt.__version?(dt.needsLights&&dt.lightsStateVersion!==Xt.state.version||dt.outputColorSpace!==z||P.isBatchedMesh&&dt.batching===!1||!P.isBatchedMesh&&dt.batching===!0||P.isBatchedMesh&&dt.batchingColor===!0&&P.colorTexture===null||P.isBatchedMesh&&dt.batchingColor===!1&&P.colorTexture!==null||P.isInstancedMesh&&dt.instancing===!1||!P.isInstancedMesh&&dt.instancing===!0||P.isSkinnedMesh&&dt.skinning===!1||!P.isSkinnedMesh&&dt.skinning===!0||P.isInstancedMesh&&dt.instancingColor===!0&&P.instanceColor===null||P.isInstancedMesh&&dt.instancingColor===!1&&P.instanceColor!==null||P.isInstancedMesh&&dt.instancingMorph===!0&&P.morphTexture===null||P.isInstancedMesh&&dt.instancingMorph===!1&&P.morphTexture!==null||dt.envMap!==W||A.fog===!0&&dt.fog!==k||dt.numClippingPlanes!==void 0&&(dt.numClippingPlanes!==Vt.numPlanes||dt.numIntersection!==Vt.numIntersection)||dt.vertexAlphas!==$||dt.vertexTangents!==nt||dt.morphTargets!==q||dt.morphNormals!==ct||dt.morphColors!==_t||dt.toneMapping!==ft||dt.morphTargetsCount!==Pt||!!dt.lightProbeGrid!=C.state.lightProbeGridArray.length>0)&&(Ot=!0):(Ot=!0,dt.__version=A.version);let It=dt.currentProgram;Ot===!0&&(It=$n(A,x,P),F&&A.isNodeMaterial&&F.onUpdateProgram(A,It,dt));let bt=!1,Bt=!1,he=!1,Ht=It.getUniforms(),zt=dt.uniforms;if(b.useProgram(It.program)&&(bt=!0,Bt=!0,he=!0),A.id!==lt&&(lt=A.id,Bt=!0),dt.needsLights){let te=os(C.state.lightProbeGridArray,P);dt.lightProbeGrid!==te&&(dt.lightProbeGrid=te,Bt=!0)}if(bt||St!==h){b.buffers.depth.getReversed()&&h.reversedDepth!==!0&&(h._reversedDepth=!0,h.updateProjectionMatrix()),Ht.setValue(V,"projectionMatrix",h.projectionMatrix),Ht.setValue(V,"viewMatrix",h.matrixWorldInverse);let Pe=Ht.map.cameraPosition;Pe!==void 0&&Pe.setValue(V,Ie.setFromMatrixPosition(h.matrixWorld)),U.logarithmicDepthBuffer&&Ht.setValue(V,"logDepthBufFC",2/(Math.log(h.far+1)/Math.LN2)),(A.isMeshPhongMaterial||A.isMeshToonMaterial||A.isMeshLambertMaterial||A.isMeshBasicMaterial||A.isMeshStandardMaterial||A.isShaderMaterial)&&Ht.setValue(V,"isOrthographic",h.isOrthographicCamera===!0),St!==h&&(St=h,Bt=!0,he=!0)}if(dt.needsLights&&(Xt.state.directionalShadowMap.length>0&&Ht.setValue(V,"directionalShadowMap",Xt.state.directionalShadowMap,et),Xt.state.spotShadowMap.length>0&&Ht.setValue(V,"spotShadowMap",Xt.state.spotShadowMap,et),Xt.state.pointShadowMap.length>0&&Ht.setValue(V,"pointShadowMap",Xt.state.pointShadowMap,et)),P.isSkinnedMesh){Ht.setOptional(V,P,"bindMatrix"),Ht.setOptional(V,P,"bindMatrixInverse");let te=P.skeleton;te&&(te.boneTexture===null&&te.computeBoneTexture(),Ht.setValue(V,"boneTexture",te.boneTexture,et))}P.isBatchedMesh&&(Ht.setOptional(V,P,"batchingTexture"),Ht.setValue(V,"batchingTexture",P._matricesTexture,et),Ht.setOptional(V,P,"batchingIdTexture"),Ht.setValue(V,"batchingIdTexture",P._indirectTexture,et),Ht.setOptional(V,P,"batchingColorTexture"),P._colorsTexture!==null&&Ht.setValue(V,"batchingColorTexture",P._colorsTexture,et));let ee=M.morphAttributes;if((ee.position!==void 0||ee.normal!==void 0||ee.color!==void 0)&&B.update(P,M,It),(Bt||dt.receiveShadow!==P.receiveShadow)&&(dt.receiveShadow=P.receiveShadow,Ht.setValue(V,"receiveShadow",P.receiveShadow)),(A.isMeshStandardMaterial||A.isMeshLambertMaterial||A.isMeshPhongMaterial)&&A.envMap===null&&x.environment!==null&&(zt.envMapIntensity.value=x.environmentIntensity),zt.dfgLUT!==void 0&&(zt.dfgLUT.value=G_()),Bt){if(Ht.setValue(V,"toneMappingExposure",L.toneMappingExposure),dt.needsLights&&ze(zt,he),k&&A.fog===!0&&Ut.refreshFogUniforms(zt,k),Ut.refreshMaterialUniforms(zt,A,ht,ot,C.state.transmissionRenderTarget[h.id]),dt.needsLights&&dt.lightProbeGrid){let te=dt.lightProbeGrid;zt.probesSH.value=te.texture,zt.probesMin.value.copy(te.boundingBox.min),zt.probesMax.value.copy(te.boundingBox.max),zt.probesResolution.value.copy(te.resolution)}Xs.upload(V,Li(dt),zt,et)}if(A.isShaderMaterial&&A.uniformsNeedUpdate===!0&&(Xs.upload(V,Li(dt),zt,et),A.uniformsNeedUpdate=!1),A.isSpriteMaterial&&Ht.setValue(V,"center",P.center),Ht.setValue(V,"modelViewMatrix",P.modelViewMatrix),Ht.setValue(V,"normalMatrix",P.normalMatrix),Ht.setValue(V,"modelMatrix",P.matrixWorld),A.uniformsGroups!==void 0){let te=A.uniformsGroups;for(let Pe=0,fe=te.length;Pe<fe;Pe++){let un=te[Pe];ut.update(un,It),ut.bind(un,It)}}return It}function ze(h,x){h.ambientLightColor.needsUpdate=x,h.lightProbe.needsUpdate=x,h.directionalLights.needsUpdate=x,h.directionalLightShadows.needsUpdate=x,h.pointLights.needsUpdate=x,h.pointLightShadows.needsUpdate=x,h.spotLights.needsUpdate=x,h.spotLightShadows.needsUpdate=x,h.rectAreaLights.needsUpdate=x,h.hemisphereLights.needsUpdate=x}function rn(h){return h.isMeshLambertMaterial||h.isMeshToonMaterial||h.isMeshPhongMaterial||h.isMeshStandardMaterial||h.isShadowMaterial||h.isShaderMaterial&&h.lights===!0}this.getActiveCubeFace=function(){return K},this.getActiveMipmapLevel=function(){return Z},this.getRenderTarget=function(){return st},this.setRenderTargetTextures=function(h,x,M){let A=j.get(h);A.__autoAllocateDepthBuffer=h.resolveDepthBuffer===!1,A.__autoAllocateDepthBuffer===!1&&(A.__useRenderToTexture=!1),j.get(h.texture).__webglTexture=x,j.get(h.depthTexture).__webglTexture=A.__autoAllocateDepthBuffer?void 0:M,A.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(h,x){let M=j.get(h);M.__webglFramebuffer=x,M.__useDefaultFramebuffer=x===void 0},this.setRenderTarget=function(h,x=0,M=0){st=h,K=x,Z=M;let A=null,P=!1,k=!1;if(h){let z=j.get(h);if(z.__useDefaultFramebuffer!==void 0){b.bindFramebuffer(V.FRAMEBUFFER,z.__webglFramebuffer),mt.copy(h.viewport),vt.copy(h.scissor),qt=h.scissorTest,b.viewport(mt),b.scissor(vt),b.setScissorTest(qt),lt=-1;return}else if(z.__webglFramebuffer===void 0)et.setupRenderTarget(h);else if(z.__hasExternalTextures)et.rebindTextures(h,j.get(h.texture).__webglTexture,j.get(h.depthTexture).__webglTexture);else if(h.depthBuffer){let $=h.depthTexture;if(z.__boundDepthTexture!==$){if($!==null&&j.has($)&&(h.width!==$.image.width||h.height!==$.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");et.setupDepthRenderbuffer(h)}}let G=h.texture;(G.isData3DTexture||G.isDataArrayTexture||G.isCompressedArrayTexture)&&(k=!0);let W=j.get(h).__webglFramebuffer;h.isWebGLCubeRenderTarget?(Array.isArray(W[x])?A=W[x][M]:A=W[x],P=!0):h.samples>0&&et.useMultisampledRTT(h)===!1?A=j.get(h).__webglMultisampledFramebuffer:Array.isArray(W)?A=W[M]:A=W,mt.copy(h.viewport),vt.copy(h.scissor),qt=h.scissorTest}else mt.copy(Lt).multiplyScalar(ht).floor(),vt.copy(re).multiplyScalar(ht).floor(),qt=Dt;if(M!==0&&(A=Y),b.bindFramebuffer(V.FRAMEBUFFER,A)&&b.drawBuffers(h,A),b.viewport(mt),b.scissor(vt),b.setScissorTest(qt),P){let z=j.get(h.texture);V.framebufferTexture2D(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_CUBE_MAP_POSITIVE_X+x,z.__webglTexture,M)}else if(k){let z=x;for(let G=0;G<h.textures.length;G++){let W=j.get(h.textures[G]);V.framebufferTextureLayer(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0+G,W.__webglTexture,M,z)}}else if(h!==null&&M!==0){let z=j.get(h.texture);V.framebufferTexture2D(V.FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,z.__webglTexture,M)}lt=-1},this.readRenderTargetPixels=function(h,x,M,A,P,k,I,z=0){if(!(h&&h.isWebGLRenderTarget)){jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let G=j.get(h).__webglFramebuffer;if(h.isWebGLCubeRenderTarget&&I!==void 0&&(G=G[I]),G){b.bindFramebuffer(V.FRAMEBUFFER,G);try{let W=h.textures[z],$=W.format,nt=W.type;if(h.textures.length>1&&V.readBuffer(V.COLOR_ATTACHMENT0+z),!U.textureFormatReadable($)){jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!U.textureTypeReadable(nt)){jt("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}x>=0&&x<=h.width-A&&M>=0&&M<=h.height-P&&V.readPixels(x,M,A,P,Tt.convert($),Tt.convert(nt),k)}finally{let W=st!==null?j.get(st).__webglFramebuffer:null;b.bindFramebuffer(V.FRAMEBUFFER,W)}}},this.readRenderTargetPixelsAsync=async function(h,x,M,A,P,k,I,z=0){if(!(h&&h.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let G=j.get(h).__webglFramebuffer;if(h.isWebGLCubeRenderTarget&&I!==void 0&&(G=G[I]),G)if(x>=0&&x<=h.width-A&&M>=0&&M<=h.height-P){b.bindFramebuffer(V.FRAMEBUFFER,G);let W=h.textures[z],$=W.format,nt=W.type;if(h.textures.length>1&&V.readBuffer(V.COLOR_ATTACHMENT0+z),!U.textureFormatReadable($))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!U.textureTypeReadable(nt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");let q=V.createBuffer();V.bindBuffer(V.PIXEL_PACK_BUFFER,q),V.bufferData(V.PIXEL_PACK_BUFFER,k.byteLength,V.STREAM_READ),V.readPixels(x,M,A,P,Tt.convert($),Tt.convert(nt),0);let ct=st!==null?j.get(st).__webglFramebuffer:null;b.bindFramebuffer(V.FRAMEBUFFER,ct);let _t=V.fenceSync(V.SYNC_GPU_COMMANDS_COMPLETE,0);return V.flush(),await Ru(V,_t,4),V.bindBuffer(V.PIXEL_PACK_BUFFER,q),V.getBufferSubData(V.PIXEL_PACK_BUFFER,0,k),V.deleteBuffer(q),V.deleteSync(_t),k}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(h,x=null,M=0){let A=Math.pow(2,-M),P=Math.floor(h.image.width*A),k=Math.floor(h.image.height*A),I=x!==null?x.x:0,z=x!==null?x.y:0;et.setTexture2D(h,0),V.copyTexSubImage2D(V.TEXTURE_2D,M,0,0,I,z,P,k),b.unbindTexture()},this.copyTextureToTexture=function(h,x,M=null,A=null,P=0,k=0){let I,z,G,W,$,nt,q,ct,_t,ft=h.isCompressedTexture?h.mipmaps[k]:h.image;if(M!==null)I=M.max.x-M.min.x,z=M.max.y-M.min.y,G=M.isBox3?M.max.z-M.min.z:1,W=M.min.x,$=M.min.y,nt=M.isBox3?M.min.z:0;else{let zt=Math.pow(2,-P);I=Math.floor(ft.width*zt),z=Math.floor(ft.height*zt),h.isDataArrayTexture?G=ft.depth:h.isData3DTexture?G=Math.floor(ft.depth*zt):G=1,W=0,$=0,nt=0}A!==null?(q=A.x,ct=A.y,_t=A.z):(q=0,ct=0,_t=0);let pt=Tt.convert(x.format),Pt=Tt.convert(x.type),dt;x.isData3DTexture?(et.setTexture3D(x,0),dt=V.TEXTURE_3D):x.isDataArrayTexture||x.isCompressedArrayTexture?(et.setTexture2DArray(x,0),dt=V.TEXTURE_2D_ARRAY):(et.setTexture2D(x,0),dt=V.TEXTURE_2D),b.activeTexture(V.TEXTURE0),b.pixelStorei(V.UNPACK_FLIP_Y_WEBGL,x.flipY),b.pixelStorei(V.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),b.pixelStorei(V.UNPACK_ALIGNMENT,x.unpackAlignment);let Xt=b.getParameter(V.UNPACK_ROW_LENGTH),Ot=b.getParameter(V.UNPACK_IMAGE_HEIGHT),It=b.getParameter(V.UNPACK_SKIP_PIXELS),bt=b.getParameter(V.UNPACK_SKIP_ROWS),Bt=b.getParameter(V.UNPACK_SKIP_IMAGES);b.pixelStorei(V.UNPACK_ROW_LENGTH,ft.width),b.pixelStorei(V.UNPACK_IMAGE_HEIGHT,ft.height),b.pixelStorei(V.UNPACK_SKIP_PIXELS,W),b.pixelStorei(V.UNPACK_SKIP_ROWS,$),b.pixelStorei(V.UNPACK_SKIP_IMAGES,nt);let he=h.isDataArrayTexture||h.isData3DTexture,Ht=x.isDataArrayTexture||x.isData3DTexture;if(h.isDepthTexture){let zt=j.get(h),ee=j.get(x),te=j.get(zt.__renderTarget),Pe=j.get(ee.__renderTarget);b.bindFramebuffer(V.READ_FRAMEBUFFER,te.__webglFramebuffer),b.bindFramebuffer(V.DRAW_FRAMEBUFFER,Pe.__webglFramebuffer);for(let fe=0;fe<G;fe++)he&&(V.framebufferTextureLayer(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,j.get(h).__webglTexture,P,nt+fe),V.framebufferTextureLayer(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,j.get(x).__webglTexture,k,_t+fe)),V.blitFramebuffer(W,$,I,z,q,ct,I,z,V.DEPTH_BUFFER_BIT,V.NEAREST);b.bindFramebuffer(V.READ_FRAMEBUFFER,null),b.bindFramebuffer(V.DRAW_FRAMEBUFFER,null)}else if(P!==0||h.isRenderTargetTexture||j.has(h)){let zt=j.get(h),ee=j.get(x);b.bindFramebuffer(V.READ_FRAMEBUFFER,J),b.bindFramebuffer(V.DRAW_FRAMEBUFFER,O);for(let te=0;te<G;te++)he?V.framebufferTextureLayer(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,zt.__webglTexture,P,nt+te):V.framebufferTexture2D(V.READ_FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,zt.__webglTexture,P),Ht?V.framebufferTextureLayer(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,ee.__webglTexture,k,_t+te):V.framebufferTexture2D(V.DRAW_FRAMEBUFFER,V.COLOR_ATTACHMENT0,V.TEXTURE_2D,ee.__webglTexture,k),P!==0?V.blitFramebuffer(W,$,I,z,q,ct,I,z,V.COLOR_BUFFER_BIT,V.NEAREST):Ht?V.copyTexSubImage3D(dt,k,q,ct,_t+te,W,$,I,z):V.copyTexSubImage2D(dt,k,q,ct,W,$,I,z);b.bindFramebuffer(V.READ_FRAMEBUFFER,null),b.bindFramebuffer(V.DRAW_FRAMEBUFFER,null)}else Ht?h.isDataTexture||h.isData3DTexture?V.texSubImage3D(dt,k,q,ct,_t,I,z,G,pt,Pt,ft.data):x.isCompressedArrayTexture?V.compressedTexSubImage3D(dt,k,q,ct,_t,I,z,G,pt,ft.data):V.texSubImage3D(dt,k,q,ct,_t,I,z,G,pt,Pt,ft):h.isDataTexture?V.texSubImage2D(V.TEXTURE_2D,k,q,ct,I,z,pt,Pt,ft.data):h.isCompressedTexture?V.compressedTexSubImage2D(V.TEXTURE_2D,k,q,ct,ft.width,ft.height,pt,ft.data):V.texSubImage2D(V.TEXTURE_2D,k,q,ct,I,z,pt,Pt,ft);b.pixelStorei(V.UNPACK_ROW_LENGTH,Xt),b.pixelStorei(V.UNPACK_IMAGE_HEIGHT,Ot),b.pixelStorei(V.UNPACK_SKIP_PIXELS,It),b.pixelStorei(V.UNPACK_SKIP_ROWS,bt),b.pixelStorei(V.UNPACK_SKIP_IMAGES,Bt),k===0&&x.generateMipmaps&&V.generateMipmap(dt),b.unbindTexture()},this.initRenderTarget=function(h){j.get(h).__webglFramebuffer===void 0&&et.setupRenderTarget(h)},this.initTexture=function(h){h.isCubeTexture?et.setTextureCube(h,0):h.isData3DTexture?et.setTexture3D(h,0):h.isDataArrayTexture||h.isCompressedArrayTexture?et.setTexture2DArray(h,0):et.setTexture2D(h,0),b.unbindTexture()},this.resetState=function(){K=0,Z=0,st=null,b.reset(),Rt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Cn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(t){this._outputColorSpace=t;let e=this.getContext();e.drawingBufferColorSpace=ce._getDrawingBufferColorSpace(t),e.unpackColorSpace=ce._getUnpackColorSpace()}};var pf={type:"change"},Zc={type:"start"},gf={type:"end"},rl=new qi,mf=new Mn,H_=Math.cos(70*vc.DEG2RAD),ke=new H,hn=2*Math.PI,ye={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},qc=1e-6,Yc=class extends Or{constructor(t,e=null){super(t,e),this.state=ye.NONE,this.target=new H,this.cursor=new H,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:Ei.ROTATE,MIDDLE:Ei.DOLLY,RIGHT:Ei.PAN},this.touches={ONE:Ci.ROTATE,TWO:Ci.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._cursorStyle="auto",this._domElementKeyEvents=null,this._lastPosition=new H,this._lastQuaternion=new We,this._lastTargetPosition=new H,this._quat=new We().setFromUnitVectors(t.up,new H(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new zs,this._sphericalDelta=new zs,this._scale=1,this._panOffset=new H,this._rotateStart=new Kt,this._rotateEnd=new Kt,this._rotateDelta=new Kt,this._panStart=new Kt,this._panEnd=new Kt,this._panDelta=new Kt,this._dollyStart=new Kt,this._dollyEnd=new Kt,this._dollyDelta=new Kt,this._dollyDirection=new H,this._mouse=new Kt,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=X_.bind(this),this._onPointerDown=W_.bind(this),this._onPointerUp=q_.bind(this),this._onContextMenu=Q_.bind(this),this._onMouseWheel=J_.bind(this),this._onKeyDown=K_.bind(this),this._onTouchStart=$_.bind(this),this._onTouchMove=j_.bind(this),this._onMouseDown=Y_.bind(this),this._onMouseMove=Z_.bind(this),this._interceptControlDown=tx.bind(this),this._interceptControlUp=ex.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}set cursorStyle(t){this._cursorStyle=t,t==="grab"?this.domElement.style.cursor="grab":this.domElement.style.cursor="auto"}get cursorStyle(){return this._cursorStyle}connect(t){super.connect(t),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction=""}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent(pf),this.update(),this.state=ye.NONE}pan(t,e){this._pan(t,e),this.update()}dollyIn(t){this._dollyIn(t),this.update()}dollyOut(t){this._dollyOut(t),this.update()}rotateLeft(t){this._rotateLeft(t),this.update()}rotateUp(t){this._rotateUp(t),this.update()}update(t=null){let e=this.object.position;ke.copy(e).sub(this.target),ke.applyQuaternion(this._quat),this._spherical.setFromVector3(ke),this.autoRotate&&this.state===ye.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let n=this.minAzimuthAngle,s=this.maxAzimuthAngle;isFinite(n)&&isFinite(s)&&(n<-Math.PI?n+=hn:n>Math.PI&&(n-=hn),s<-Math.PI?s+=hn:s>Math.PI&&(s-=hn),n<=s?this._spherical.theta=Math.max(n,Math.min(s,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(n+s)/2?Math.max(n,this._spherical.theta):Math.min(s,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let r=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{let a=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),r=a!=this._spherical.radius}if(ke.setFromSpherical(this._spherical),ke.applyQuaternion(this._quatInverse),e.copy(this.target).add(ke),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let a=null;if(this.object.isPerspectiveCamera){let o=ke.length();a=this._clampDistance(o*this._scale);let l=o-a;this.object.position.addScaledVector(this._dollyDirection,l),this.object.updateMatrixWorld(),r=!!l}else if(this.object.isOrthographicCamera){let o=new H(this._mouse.x,this._mouse.y,0);o.unproject(this.object);let l=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),r=l!==this.object.zoom;let c=new H(this._mouse.x,this._mouse.y,0);c.unproject(this.object),this.object.position.sub(c).add(o),this.object.updateMatrixWorld(),a=ke.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;a!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(a).add(this.object.position):(rl.origin.copy(this.object.position),rl.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(rl.direction))<H_?this.object.lookAt(this.target):(mf.setFromNormalAndCoplanarPoint(this.object.up,this.target),rl.intersectPlane(mf,this.target))))}else if(this.object.isOrthographicCamera){let a=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),a!==this.object.zoom&&(this.object.updateProjectionMatrix(),r=!0)}return this._scale=1,this._performCursorZoom=!1,r||this._lastPosition.distanceToSquared(this.object.position)>qc||8*(1-this._lastQuaternion.dot(this.object.quaternion))>qc||this._lastTargetPosition.distanceToSquared(this.target)>qc?(this.dispatchEvent(pf),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?hn/60*this.autoRotateSpeed*t:hn/60/60*this.autoRotateSpeed}_getZoomScale(t){let e=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*e)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,e){ke.setFromMatrixColumn(e,0),ke.multiplyScalar(-t),this._panOffset.add(ke)}_panUp(t,e){this.screenSpacePanning===!0?ke.setFromMatrixColumn(e,1):(ke.setFromMatrixColumn(e,0),ke.crossVectors(this.object.up,ke)),ke.multiplyScalar(t),this._panOffset.add(ke)}_pan(t,e){let n=this.domElement;if(this.object.isPerspectiveCamera){let s=this.object.position;ke.copy(s).sub(this.target);let r=ke.length();r*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*r/n.clientHeight,this.object.matrix),this._panUp(2*e*r/n.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/n.clientWidth,this.object.matrix),this._panUp(e*(this.object.top-this.object.bottom)/this.object.zoom/n.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,e){if(!this.zoomToCursor)return;this._performCursorZoom=!0;let n=this.domElement.getBoundingClientRect(),s=t-n.left,r=e-n.top,a=n.width,o=n.height;this._mouse.x=s/a*2-1,this._mouse.y=-(r/o)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let e=this.domElement;this._rotateLeft(hn*this._rotateDelta.x/e.clientHeight),this._rotateUp(hn*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let e=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(hn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),e=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(-hn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),e=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(hn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),e=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(-hn*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),e=!0;break}e&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{let e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._rotateStart.set(n,s)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{let e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._panStart.set(n,s)}}_handleTouchStartDolly(t){let e=this._getSecondPointerPosition(t),n=t.pageX-e.x,s=t.pageY-e.y,r=Math.sqrt(n*n+s*s);this._dollyStart.set(0,r)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{let n=this._getSecondPointerPosition(t),s=.5*(t.pageX+n.x),r=.5*(t.pageY+n.y);this._rotateEnd.set(s,r)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);let e=this.domElement;this._rotateLeft(hn*this._rotateDelta.x/e.clientHeight),this._rotateUp(hn*this._rotateDelta.y/e.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{let e=this._getSecondPointerPosition(t),n=.5*(t.pageX+e.x),s=.5*(t.pageY+e.y);this._panEnd.set(n,s)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){let e=this._getSecondPointerPosition(t),n=t.pageX-e.x,s=t.pageY-e.y,r=Math.sqrt(n*n+s*s);this._dollyEnd.set(0,r),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);let a=(t.pageX+e.x)*.5,o=(t.pageY+e.y)*.5;this._updateZoomParameters(a,o)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId){this._pointers.splice(e,1);return}}_isTrackingPointer(t){for(let e=0;e<this._pointers.length;e++)if(this._pointers[e]==t.pointerId)return!0;return!1}_trackPointer(t){let e=this._pointerPositions[t.pointerId];e===void 0&&(e=new Kt,this._pointerPositions[t.pointerId]=e),e.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){let e=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[e]}_customWheelEvent(t){let e=t.deltaMode,n={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(e){case 1:n.deltaY*=16;break;case 2:n.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(n.deltaY*=10),n}};function W_(i){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(i.pointerId),this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(i)&&(this._addPointer(i),i.pointerType==="touch"?this._onTouchStart(i):this._onMouseDown(i),this._cursorStyle==="grab"&&(this.domElement.style.cursor="grabbing")))}function X_(i){this.enabled!==!1&&(i.pointerType==="touch"?this._onTouchMove(i):this._onMouseMove(i))}function q_(i){switch(this._removePointer(i),this._pointers.length){case 0:this.domElement.releasePointerCapture(i.pointerId),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(gf),this.state=ye.NONE,this._cursorStyle==="grab"&&(this.domElement.style.cursor="grab");break;case 1:let t=this._pointers[0],e=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:e.x,pageY:e.y});break}}function Y_(i){let t;switch(i.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case Ei.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(i),this.state=ye.DOLLY;break;case Ei.ROTATE:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ye.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ye.ROTATE}break;case Ei.PAN:if(i.ctrlKey||i.metaKey||i.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(i),this.state=ye.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(i),this.state=ye.PAN}break;default:this.state=ye.NONE}this.state!==ye.NONE&&this.dispatchEvent(Zc)}function Z_(i){switch(this.state){case ye.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(i);break;case ye.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(i);break;case ye.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(i);break}}function J_(i){this.enabled===!1||this.enableZoom===!1||this.state!==ye.NONE||(i.preventDefault(),this.dispatchEvent(Zc),this._handleMouseWheel(this._customWheelEvent(i)),this.dispatchEvent(gf))}function K_(i){this.enabled!==!1&&this._handleKeyDown(i)}function $_(i){switch(this._trackPointer(i),this._pointers.length){case 1:switch(this.touches.ONE){case Ci.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(i),this.state=ye.TOUCH_ROTATE;break;case Ci.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(i),this.state=ye.TOUCH_PAN;break;default:this.state=ye.NONE}break;case 2:switch(this.touches.TWO){case Ci.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(i),this.state=ye.TOUCH_DOLLY_PAN;break;case Ci.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(i),this.state=ye.TOUCH_DOLLY_ROTATE;break;default:this.state=ye.NONE}break;default:this.state=ye.NONE}this.state!==ye.NONE&&this.dispatchEvent(Zc)}function j_(i){switch(this._trackPointer(i),this.state){case ye.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(i),this.update();break;case ye.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(i),this.update();break;case ye.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(i),this.update();break;case ye.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(i),this.update();break;default:this.state=ye.NONE}}function Q_(i){this.enabled!==!1&&i.preventDefault()}function tx(i){i.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function ex(i){i.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}var Ee=Uint8Array,xn=Uint16Array,rh=Int32Array,al=new Ee([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),ol=new Ee([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Qc=new Ee([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),bf=function(i,t){for(var e=new xn(31),n=0;n<31;++n)e[n]=t+=1<<i[n-1];for(var s=new rh(e[30]),n=1;n<30;++n)for(var r=e[n];r<e[n+1];++r)s[r]=r-e[n]<<5|n;return{b:e,r:s}},wf=bf(al,2),Af=wf.b,th=wf.r;Af[28]=258,th[258]=28;var Tf=bf(ol,0),nx=Tf.b,_f=Tf.r,eh=new xn(32768);for(de=0;de<32768;++de)pi=(de&43690)>>1|(de&21845)<<1,pi=(pi&52428)>>2|(pi&13107)<<2,pi=(pi&61680)>>4|(pi&3855)<<4,eh[de]=((pi&65280)>>8|(pi&255)<<8)>>1;var pi,de,Jn=(function(i,t,e){for(var n=i.length,s=0,r=new xn(t);s<n;++s)i[s]&&++r[i[s]-1];var a=new xn(t);for(s=1;s<t;++s)a[s]=a[s-1]+r[s-1]<<1;var o;if(e){o=new xn(1<<t);var l=15-t;for(s=0;s<n;++s)if(i[s])for(var c=s<<4|i[s],f=t-i[s],u=a[i[s]-1]++<<f,d=u|(1<<f)-1;u<=d;++u)o[eh[u]>>l]=c}else for(o=new xn(n),s=0;s<n;++s)i[s]&&(o[s]=eh[a[i[s]-1]++]>>15-i[s]);return o}),Ui=new Ee(288);for(de=0;de<144;++de)Ui[de]=8;var de;for(de=144;de<256;++de)Ui[de]=9;var de;for(de=256;de<280;++de)Ui[de]=7;var de;for(de=280;de<288;++de)Ui[de]=8;var de,ta=new Ee(32);for(de=0;de<32;++de)ta[de]=5;var de,ix=Jn(Ui,9,0),sx=Jn(Ui,9,1),rx=Jn(ta,5,0),ax=Jn(ta,5,1),Jc=function(i){for(var t=i[0],e=1;e<i.length;++e)i[e]>t&&(t=i[e]);return t},Ln=function(i,t,e){var n=t/8|0;return(i[n]|i[n+1]<<8)>>(t&7)&e},Kc=function(i,t){var e=t/8|0;return(i[e]|i[e+1]<<8|i[e+2]<<16)>>(t&7)},ah=function(i){return(i+7)/8|0},ea=function(i,t,e){return(t==null||t<0)&&(t=0),(e==null||e>i.length)&&(e=i.length),new Ee(i.subarray(t,e))};var ox=["unexpected EOF","invalid block type","invalid length/literal","invalid distance","stream finished","no stream handler",,"no callback","invalid UTF-8 data","extra field too long","date not in range 1980-2099","filename too long","stream finishing","invalid zip data"],Je=function(i,t,e){var n=new Error(t||ox[i]);if(n.code=i,Error.captureStackTrace&&Error.captureStackTrace(n,Je),!e)throw n;return n},Ef=function(i,t,e,n){var s=i.length,r=n?n.length:0;if(!s||t.f&&!t.l)return e||new Ee(0);var a=!e,o=a||t.i!=2,l=t.i;a&&(e=new Ee(s*3));var c=function(Lt){var re=e.length;if(Lt>re){var Dt=new Ee(Math.max(re*2,Lt));Dt.set(e),e=Dt}},f=t.f||0,u=t.p||0,d=t.b||0,p=t.l,g=t.d,y=t.m,m=t.n,_=s*8;do{if(!p){f=Ln(i,u,1);var R=Ln(i,u+1,3);if(u+=3,R)if(R==1)p=sx,g=ax,y=9,m=5;else if(R==2){var C=Ln(i,u,31)+257,D=Ln(i,u+10,15)+4,S=C+Ln(i,u+5,31)+1;u+=14;for(var T=new Ee(S),L=new Ee(19),N=0;N<D;++N)L[Qc[N]]=Ln(i,u+N*3,7);u+=D*3;for(var F=Jc(L),Y=(1<<F)-1,J=Jn(L,F,1),N=0;N<S;){var O=J[Ln(i,u,Y)];u+=O&15;var w=O>>4;if(w<16)T[N++]=w;else{var K=0,Z=0;for(w==16?(Z=3+Ln(i,u,3),u+=2,K=T[N-1]):w==17?(Z=3+Ln(i,u,7),u+=3):w==18&&(Z=11+Ln(i,u,127),u+=7);Z--;)T[N++]=K}}var st=T.subarray(0,C),lt=T.subarray(C);y=Jc(st),m=Jc(lt),p=Jn(st,y,1),g=Jn(lt,m,1)}else Je(1);else{var w=ah(u)+4,v=i[w-4]|i[w-3]<<8,E=w+v;if(E>s){l&&Je(0);break}o&&c(d+v),e.set(i.subarray(w,E),d),t.b=d+=v,t.p=u=E*8,t.f=f;continue}if(u>_){l&&Je(0);break}}o&&c(d+131072);for(var St=(1<<y)-1,mt=(1<<m)-1,vt=u;;vt=u){var K=p[Kc(i,u)&St],qt=K>>4;if(u+=K&15,u>_){l&&Je(0);break}if(K||Je(2),qt<256)e[d++]=qt;else if(qt==256){vt=u,p=null;break}else{var Qt=qt-254;if(qt>264){var N=qt-257,kt=al[N];Qt=Ln(i,u,(1<<kt)-1)+Af[N],u+=kt}var tt=g[Kc(i,u)&mt],ot=tt>>4;tt||Je(3),u+=tt&15;var lt=nx[ot];if(ot>3){var kt=ol[ot];lt+=Kc(i,u)&(1<<kt)-1,u+=kt}if(u>_){l&&Je(0);break}o&&c(d+131072);var ht=d+Qt;if(d<lt){var gt=r-lt,Nt=Math.min(lt,ht);for(gt+d<0&&Je(3);d<Nt;++d)e[d]=n[gt+d]}for(;d<ht;++d)e[d]=e[d-lt]}}t.l=p,t.p=vt,t.b=d,t.f=f,p&&(f=1,t.m=y,t.d=g,t.n=m)}while(!f);return d!=e.length&&a?ea(e,0,d):e.subarray(0,d)},mi=function(i,t,e){e<<=t&7;var n=t/8|0;i[n]|=e,i[n+1]|=e>>8},jr=function(i,t,e){e<<=t&7;var n=t/8|0;i[n]|=e,i[n+1]|=e>>8,i[n+2]|=e>>16},$c=function(i,t){for(var e=[],n=0;n<i.length;++n)i[n]&&e.push({s:n,f:i[n]});var s=e.length,r=e.slice();if(!s)return{t:Rf,l:0};if(s==1){var a=new Ee(e[0].s+1);return a[e[0].s]=1,{t:a,l:1}}e.sort(function(E,C){return E.f-C.f}),e.push({s:-1,f:25001});var o=e[0],l=e[1],c=0,f=1,u=2;for(e[0]={s:-1,f:o.f+l.f,l:o,r:l};f!=s-1;)o=e[e[c].f<e[u].f?c++:u++],l=e[c!=f&&e[c].f<e[u].f?c++:u++],e[f++]={s:-1,f:o.f+l.f,l:o,r:l};for(var d=r[0].s,n=1;n<s;++n)r[n].s>d&&(d=r[n].s);var p=new xn(d+1),g=nh(e[f-1],p,0);if(g>t){var n=0,y=0,m=g-t,_=1<<m;for(r.sort(function(C,D){return p[D.s]-p[C.s]||C.f-D.f});n<s;++n){var R=r[n].s;if(p[R]>t)y+=_-(1<<g-p[R]),p[R]=t;else break}for(y>>=m;y>0;){var w=r[n].s;p[w]<t?y-=1<<t-p[w]++-1:++n}for(;n>=0&&y;--n){var v=r[n].s;p[v]==t&&(--p[v],++y)}g=t}return{t:new Ee(p),l:g}},nh=function(i,t,e){return i.s==-1?Math.max(nh(i.l,t,e+1),nh(i.r,t,e+1)):t[i.s]=e},xf=function(i){for(var t=i.length;t&&!i[--t];);for(var e=new xn(++t),n=0,s=i[0],r=1,a=function(l){e[n++]=l},o=1;o<=t;++o)if(i[o]==s&&o!=t)++r;else{if(!s&&r>2){for(;r>138;r-=138)a(32754);r>2&&(a(r>10?r-11<<5|28690:r-3<<5|12305),r=0)}else if(r>3){for(a(s),--r;r>6;r-=6)a(8304);r>2&&(a(r-3<<5|8208),r=0)}for(;r--;)a(s);r=1,s=i[o]}return{c:e.subarray(0,n),n:t}},Qr=function(i,t){for(var e=0,n=0;n<t.length;++n)e+=i[n]*t[n];return e},Cf=function(i,t,e){var n=e.length,s=ah(t+2);i[s]=n&255,i[s+1]=n>>8,i[s+2]=i[s]^255,i[s+3]=i[s+1]^255;for(var r=0;r<n;++r)i[s+r+4]=e[r];return(s+4+n)*8},yf=function(i,t,e,n,s,r,a,o,l,c,f){mi(t,f++,e),++s[256];for(var u=$c(s,15),d=u.t,p=u.l,g=$c(r,15),y=g.t,m=g.l,_=xf(d),R=_.c,w=_.n,v=xf(y),E=v.c,C=v.n,D=new xn(19),S=0;S<R.length;++S)++D[R[S]&31];for(var S=0;S<E.length;++S)++D[E[S]&31];for(var T=$c(D,7),L=T.t,N=T.l,F=19;F>4&&!L[Qc[F-1]];--F);var Y=c+5<<3,J=Qr(s,Ui)+Qr(r,ta)+a,O=Qr(s,d)+Qr(r,y)+a+14+3*F+Qr(D,L)+2*D[16]+3*D[17]+7*D[18];if(l>=0&&Y<=J&&Y<=O)return Cf(t,f,i.subarray(l,l+c));var K,Z,st,lt;if(mi(t,f,1+(O<J)),f+=2,O<J){K=Jn(d,p,0),Z=d,st=Jn(y,m,0),lt=y;var St=Jn(L,N,0);mi(t,f,w-257),mi(t,f+5,C-1),mi(t,f+10,F-4),f+=14;for(var S=0;S<F;++S)mi(t,f+3*S,L[Qc[S]]);f+=3*F;for(var mt=[R,E],vt=0;vt<2;++vt)for(var qt=mt[vt],S=0;S<qt.length;++S){var Qt=qt[S]&31;mi(t,f,St[Qt]),f+=L[Qt],Qt>15&&(mi(t,f,qt[S]>>5&127),f+=qt[S]>>12)}}else K=ix,Z=Ui,st=rx,lt=ta;for(var S=0;S<o;++S){var kt=n[S];if(kt>255){var Qt=kt>>18&31;jr(t,f,K[Qt+257]),f+=Z[Qt+257],Qt>7&&(mi(t,f,kt>>23&31),f+=al[Qt]);var tt=kt&31;jr(t,f,st[tt]),f+=lt[tt],tt>3&&(jr(t,f,kt>>5&8191),f+=ol[tt])}else jr(t,f,K[kt]),f+=Z[kt]}return jr(t,f,K[256]),f+Z[256]},lx=new rh([65540,131080,131088,131104,262176,1048704,1048832,2114560,2117632]),Rf=new Ee(0),cx=function(i,t,e,n,s,r){var a=r.z||i.length,o=new Ee(n+a+5*(1+Math.ceil(a/7e3))+s),l=o.subarray(n,o.length-s),c=r.l,f=(r.r||0)&7;if(t){f&&(l[0]=r.r>>3);for(var u=lx[t-1],d=u>>13,p=u&8191,g=(1<<e)-1,y=r.p||new xn(32768),m=r.h||new xn(g+1),_=Math.ceil(e/3),R=2*_,w=function($t){return(i[$t]^i[$t+1]<<_^i[$t+2]<<R)&g},v=new rh(25e3),E=new xn(288),C=new xn(32),D=0,S=0,T=r.i||0,L=0,N=r.w||0,F=0;T+2<a;++T){var Y=w(T),J=T&32767,O=m[Y];if(y[J]=O,m[Y]=J,N<=T){var K=a-T;if((D>7e3||L>24576)&&(K>423||!c)){f=yf(i,l,0,v,E,C,S,L,F,T-F,f),L=D=S=0,F=T;for(var Z=0;Z<286;++Z)E[Z]=0;for(var Z=0;Z<30;++Z)C[Z]=0}var st=2,lt=0,St=p,mt=J-O&32767;if(K>2&&Y==w(T-mt))for(var vt=Math.min(d,K)-1,qt=Math.min(32767,T),Qt=Math.min(258,K);mt<=qt&&--St&&J!=O;){if(i[T+st]==i[T+st-mt]){for(var kt=0;kt<Qt&&i[T+kt]==i[T+kt-mt];++kt);if(kt>st){if(st=kt,lt=mt,kt>vt)break;for(var tt=Math.min(mt,kt-2),ot=0,Z=0;Z<tt;++Z){var ht=T-mt+Z&32767,gt=y[ht],Nt=ht-gt&32767;Nt>ot&&(ot=Nt,O=ht)}}}J=O,O=y[J],mt+=J-O&32767}if(lt){v[L++]=268435456|th[st]<<18|_f[lt];var Lt=th[st]&31,re=_f[lt]&31;S+=al[Lt]+ol[re],++E[257+Lt],++C[re],N=T+st,++D}else v[L++]=i[T],++E[i[T]]}}for(T=Math.max(T,N);T<a;++T)v[L++]=i[T],++E[i[T]];f=yf(i,l,c,v,E,C,S,L,F,T-F,f),c||(r.r=f&7|l[f/8|0]<<3,f-=7,r.h=m,r.p=y,r.i=T,r.w=N)}else{for(var T=r.w||0;T<a+c;T+=65535){var Dt=T+65535;Dt>=a&&(l[f/8|0]=c,Dt=a),f=Cf(l,f+1,i.subarray(T,Dt))}r.i=a}return ea(o,0,n+ah(f)+s)},hx=(function(){for(var i=new Int32Array(256),t=0;t<256;++t){for(var e=t,n=9;--n;)e=(e&1&&-306674912)^e>>>1;i[t]=e}return i})(),ux=function(){var i=-1;return{p:function(t){for(var e=i,n=0;n<t.length;++n)e=hx[e&255^t[n]]^e>>>8;i=e},d:function(){return~i}}};var fx=function(i,t,e,n,s){if(!s&&(s={l:1},t.dictionary)){var r=t.dictionary.subarray(-32768),a=new Ee(r.length+i.length);a.set(r),a.set(i,r.length),i=a,s.w=r.length}return cx(i,t.level==null?6:t.level,t.mem==null?s.l?Math.ceil(Math.max(8,Math.min(13,Math.log(i.length)))*1.5):20:12+t.mem,e,n,s)},Pf=function(i,t){var e={};for(var n in i)e[n]=i[n];for(var n in t)e[n]=t[n];return e};var Zn=function(i,t){return i[t]|i[t+1]<<8},Nn=function(i,t){return(i[t]|i[t+1]<<8|i[t+2]<<16|i[t+3]<<24)>>>0},jc=function(i,t){return Nn(i,t)+Nn(i,t+4)*4294967296},Ze=function(i,t,e){for(;e;++t)i[t]=e,e>>>=8};var dx=function(i,t){return((i[0]&15)!=8||i[0]>>4>7||(i[0]<<8|i[1])%31)&&Je(6,"invalid zlib data"),(i[1]>>5&1)==+!t&&Je(6,"invalid zlib data: "+(i[1]&32?"need":"unexpected")+" dictionary"),(i[1]>>3&4)+2};function px(i,t){return fx(i,t||{},0,0)}function mx(i,t){return Ef(i,{i:2},t&&t.out,t&&t.dictionary)}function Ys(i,t){return Ef(i.subarray(dx(i,t&&t.dictionary),-4),{i:2},t&&t.out,t&&t.dictionary)}var If=function(i,t,e,n){for(var s in i){var r=i[s],a=t+s,o=n;Array.isArray(r)&&(o=Pf(n,r[1]),r=r[0]),r instanceof Ee?e[a]=[r,o]:(e[a+="/"]=[new Ee(0),o],If(r,a,e,n))}},vf=typeof TextEncoder<"u"&&new TextEncoder,ih=typeof TextDecoder<"u"&&new TextDecoder,gx=0;try{ih.decode(Rf,{stream:!0}),gx=1}catch{}var _x=function(i){for(var t="",e=0;;){var n=i[e++],s=(n>127)+(n>223)+(n>239);if(e+s>i.length)return{s:t,r:ea(i,e-1)};s?s==3?(n=((n&15)<<18|(i[e++]&63)<<12|(i[e++]&63)<<6|i[e++]&63)-65536,t+=String.fromCharCode(55296|n>>10,56320|n&1023)):s&1?t+=String.fromCharCode((n&31)<<6|i[e++]&63):t+=String.fromCharCode((n&15)<<12|(i[e++]&63)<<6|i[e++]&63):t+=String.fromCharCode(n)}};function Sf(i,t){if(t){for(var e=new Ee(i.length),n=0;n<i.length;++n)e[n]=i.charCodeAt(n);return e}if(vf)return vf.encode(i);for(var s=i.length,r=new Ee(i.length+(i.length>>1)),a=0,o=function(f){r[a++]=f},n=0;n<s;++n){if(a+5>r.length){var l=new Ee(a+8+(s-n<<1));l.set(r),r=l}var c=i.charCodeAt(n);c<128||t?o(c):c<2048?(o(192|c>>6),o(128|c&63)):c>55295&&c<57344?(c=65536+(c&1047552)|i.charCodeAt(++n)&1023,o(240|c>>18),o(128|c>>12&63),o(128|c>>6&63),o(128|c&63)):(o(224|c>>12),o(128|c>>6&63),o(128|c&63))}return ea(r,0,a)}function xx(i,t){if(t){for(var e="",n=0;n<i.length;n+=16384)e+=String.fromCharCode.apply(null,i.subarray(n,n+16384));return e}else{if(ih)return ih.decode(i);var s=_x(i),r=s.s,e=s.r;return e.length&&Je(8),r}}var yx=function(i,t){return t+30+Zn(i,t+26)+Zn(i,t+28)},vx=function(i,t,e){var n=Zn(i,t+28),s=xx(i.subarray(t+46,t+46+n),!(Zn(i,t+8)&2048)),r=t+46+n,a=Nn(i,t+20),o=e&&a==4294967295?Sx(i,r):[a,Nn(i,t+24),Nn(i,t+42)],l=o[0],c=o[1],f=o[2];return[Zn(i,t+10),l,c,s,r+Zn(i,t+30)+Zn(i,t+32),f]},Sx=function(i,t){for(;Zn(i,t)!=1;t+=4+Zn(i,t+2));return[jc(i,t+12),jc(i,t+4),jc(i,t+20)]},sh=function(i){var t=0;if(i)for(var e in i){var n=i[e].length;n>65535&&Je(9),t+=n+4}return t},Mf=function(i,t,e,n,s,r,a,o){var l=n.length,c=e.extra,f=o&&o.length,u=sh(c);Ze(i,t,a!=null?33639248:67324752),t+=4,a!=null&&(i[t++]=20,i[t++]=e.os),i[t]=20,t+=2,i[t++]=e.flag<<1|(r<0&&8),i[t++]=s&&8,i[t++]=e.compression&255,i[t++]=e.compression>>8;var d=new Date(e.mtime==null?Date.now():e.mtime),p=d.getFullYear()-1980;if((p<0||p>119)&&Je(10),Ze(i,t,p<<25|d.getMonth()+1<<21|d.getDate()<<16|d.getHours()<<11|d.getMinutes()<<5|d.getSeconds()>>1),t+=4,r!=-1&&(Ze(i,t,e.crc),Ze(i,t+4,r<0?-r-2:r),Ze(i,t+8,e.size)),Ze(i,t+12,l),Ze(i,t+14,u),t+=16,a!=null&&(Ze(i,t,f),Ze(i,t+6,e.attrs),Ze(i,t+10,a),t+=14),i.set(n,t),t+=l,u)for(var g in c){var y=c[g],m=y.length;Ze(i,t,+g),Ze(i,t+2,m),i.set(y,t+4),t+=4+m}return f&&(i.set(o,t),t+=f),t},Mx=function(i,t,e,n,s){Ze(i,t,101010256),Ze(i,t+8,e),Ze(i,t+10,e),Ze(i,t+12,n),Ze(i,t+16,s)};function bx(i,t){t||(t={});var e={},n=[];If(i,"",e,t);var s=0,r=0;for(var a in e){var o=e[a],l=o[0],c=o[1],f=c.level==0?0:8,u=Sf(a),d=u.length,p=c.comment,g=p&&Sf(p),y=g&&g.length,m=sh(c.extra);d>65535&&Je(11);var _=f?px(l,c):l,R=_.length,w=ux();w.p(l),n.push(Pf(c,{size:l.length,crc:w.d(),c:_,f:u,m:g,u:d!=a.length||g&&p.length!=y,o:s,compression:f})),s+=30+d+m+R,r+=76+2*(d+m)+(y||0)+R}for(var v=new Ee(r+22),E=s,C=r-s,D=0;D<n.length;++D){var u=n[D];Mf(v,u.o,u,u.f,u.u,u.c.length);var S=30+u.f.length+sh(u.extra);v.set(u.c,u.o+S),Mf(v,s,u,u.f,u.u,u.c.length,u.o,u.m),s+=16+S+(u.m?u.m.length:0)}return Mx(v,s,n.length,C,E),v}function oh(i,t){for(var e={},n=i.length-22;Nn(i,n)!=101010256;--n)(!n||i.length-n>65558)&&Je(13);var s=Zn(i,n+8);if(!s)return{};var r=Nn(i,n+16),a=r==4294967295||s==65535;if(a){var o=Nn(i,n-12);a=Nn(i,o)==101075792,a&&(s=Nn(i,o+32),r=Nn(i,o+48))}for(var l=t&&t.filter,c=0;c<s;++c){var f=vx(i,r,a),u=f[0],d=f[1],p=f[2],g=f[3],y=f[4],m=f[5],_=yx(i,m);r=y,(!l||l({name:g,size:d,originalSize:p,compression:u}))&&(u?u==8?e[g]=mx(i.subarray(_,_+d),{out:new Ee(p)}):Je(14,"unknown compression type "+u):e[g]=ea(i,_,_+d))}return e}var wx=/^def\s+(?:(\w+)\s+)?"?([^"]+)"?$/,Ax=/^string\s+(\w+)$/,Tx=/^(?:uniform\s+)?(\w+(?:\[\])?)\s+(.+)$/,ll={Attribute:1,Prim:6,Relationship:8},cl=class{parseText(t){t=this._preprocess(t);let e={},n=t.split(`
`),s=null,r=e,a=[e];for(let o of n)if(o.includes("=")){let l=this._findAssignmentOperator(o);if(l===-1){s=o.trim();continue}let c=o.slice(0,l).trim(),f=o.slice(l+1).trim();if(f.endsWith("{")){let u={};a.push(u),r[c]=u,r=u}else if(f.endsWith("(")){let u=f.slice(0,-1);r[c]=u;let d={};a.push(d),r=d}else r[c]=f}else if(o.includes(":")&&!o.includes("=")){let l=o.indexOf(":"),c=o.slice(0,l).trim(),f=o.slice(l+1).trim();/^[\d.]+$/.test(c)&&(r[c]=f)}else if(o.endsWith("{")){s=o.slice(0,-1).trim()||s;let l=r[s]||{};a.push(l),r[s]=l,r=l}else if(o.endsWith("}")){if(a.pop(),a.length===0)continue;r=a[a.length-1]}else if(o.endsWith("(")){let l={};a.push(l),s=o.split("(")[0].trim()||s,r[s]=l,r=l}else o.endsWith(")")?(a.pop(),r=a[a.length-1]):o.trim()&&(s=o.trim());return e}_preprocess(t){t=this._stripBlockComments(t),t=this._collapseTripleQuotedStrings(t);let e=t.split(`
`),n=[],s=!1,r=0,a=0,o="";for(let l=0;l<e.length;l++){let c=e[l];c=this._stripInlineComment(c);let f=c.trim();if(s){o+=" "+f;for(let u of f)u==="["?r++:u==="]"?r--:u==="("&&r>0?a++:u===")"&&r>0&&a--;r===0&&a===0&&(n.push(o),o="",s=!1)}else{if(f.includes("=")){let u=this._findAssignmentOperator(f);if(u!==-1){let d=f.slice(u+1).trim(),p=0,g=0;for(let y of d)y==="["?p++:y==="]"&&g++;if(p>g){s=!0,r=p-g,a=0,o=f;continue}}}n.push(f)}}return n.join(`
`)}_stripBlockComments(t){let e="",n=0;for(;n<t.length;)if(t[n]==="/"&&n+1<t.length&&t[n+1]==="*"){let s=n+2;for(;s<t.length;){if(t[s]==="*"&&s+1<t.length&&t[s+1]==="/"){s+=2;break}s++}n=s}else e+=t[n],n++;return e}_collapseTripleQuotedStrings(t){let e="",n=0;for(;n<t.length;){if(n+2<t.length){let s=t.slice(n,n+3);if(s==="'''"||s==='"""'){let r=s;for(e+=r,n+=3;n<t.length;)if(n+2<t.length&&t.slice(n,n+3)===r){e+=r,n+=3;break}else t[n]===`
`?e+="\\n":t[n]!=="\r"&&(e+=t[n]),n++;continue}}e+=t[n],n++}return e}_stripInlineComment(t){if(t.trim().startsWith("#usda"))return t;let e=!1,n=null,s=!1;for(let r=0;r<t.length;r++){let a=t[r];if(s){s=!1;continue}if(a==="\\"){s=!0;continue}if(!e&&(a==='"'||a==="'"))e=!0,n=a;else if(e&&a===n)e=!1,n=null;else if(!e&&a==="#")return t.slice(0,r).trimEnd()}return t}_findAssignmentOperator(t){let e=!1,n=null,s=!1;for(let r=0;r<t.length;r++){let a=t[r];if(s){s=!1;continue}if(a==="\\"){s=!0;continue}if(!e&&(a==='"'||a==="'"))e=!0,n=a;else if(e&&a===n)e=!1,n=null;else if(!e&&a==="=")return r}return-1}parseData(t){let e=this.parseText(t),n={},s={};if("#usda 1.0"in e){let a=e["#usda 1.0"];a.upAxis&&(s.upAxis=a.upAxis.replace(/"/g,"")),a.defaultPrim&&(s.defaultPrim=a.defaultPrim.replace(/"/g,"")),a.metersPerUnit!==void 0&&(s.metersPerUnit=parseFloat(a.metersPerUnit)),a.framesPerSecond!==void 0&&(s.framesPerSecond=parseFloat(a.framesPerSecond)),a.timeCodesPerSecond!==void 0&&(s.timeCodesPerSecond=parseFloat(a.timeCodesPerSecond))}n["/"]={specType:ll.Prim,fields:s};let r=(a,o)=>{let l=[];for(let c in a){if(c==="#usda 1.0"||c==="variants")continue;let f=c.match(wx);if(f){let u=f[1]||"",d=f[2],p=o==="/"?"/"+d:o+"/"+d;l.push(d);let g={typeName:u},y=a[c];this._extractPrimData(y,p,g,n,ll),n[p]={specType:ll.Prim,fields:g},r(y,p)}}l.length>0&&n[o]&&(n[o].fields.primChildren=l)};return r(e,"/"),this._inferSkelElementSize(n),{specsByPath:n}}_inferSkelElementSize(t){for(let e in t){let n=t[e];if(n.specType!==ll.Prim||n.fields.typeName!=="Mesh")continue;let s=t[e+".points"];if(!s||!s.fields.default)continue;let r=s.fields.default.length/3;r!==0&&(this._inferElementSize(t[e+".primvars:skel:jointIndices"],r),this._inferElementSize(t[e+".primvars:skel:jointWeights"],r))}}_inferElementSize(t,e){if(!t||t.fields.elementSize!==void 0||!t.fields.default)return;let n=t.fields.default.length;n>0&&n%e===0&&(t.fields.elementSize=n/e)}_extractPrimData(t,e,n,s,r){if(!(!t||typeof t!="object"))for(let a in t){if(a.startsWith("def "))continue;if(a==="prepend references"){n.references=[t[a]];continue}if(a==="payload"){n.payload=t[a];continue}if(a==="variants"){let l={},c=t[a];for(let f in c){let u=f.match(Ax);if(u){let d=u[1],p=c[f].replace(/"/g,"");l[d]=p}}Object.keys(l).length>0&&(n.variantSelection=l);continue}if(a.startsWith("rel ")){let l=a.slice(4),c=e+"."+l,f=t[a].replace(/[<>]/g,"");s[c]={specType:r.Relationship,fields:{targetPaths:[f]}};continue}if(a.includes("xformOpOrder")){let l=t[a].replace(/[\[\]]/g,"").split(",").map(c=>c.trim().replace(/"/g,""));n.xformOpOrder=l;continue}let o=a.match(Tx);if(o){let l=o[1],c=o[2],f=t[a];if(c.endsWith(".connect")){let u=c.slice(0,-8),d=e+"."+u,p=String(f).trim();p.startsWith("<")&&(p=p.slice(1)),p.endsWith(">")&&(p=p.slice(0,-1)),s[d]||(s[d]={specType:r.Attribute,fields:{typeName:l}}),s[d].fields.connectionPaths=[p];continue}if(c.endsWith(".timeSamples")&&typeof f=="object"){let u=c.slice(0,-12),d=e+"."+u,p=[],g=[];for(let m in f){let _=parseFloat(m);isNaN(_)||(p.push(_),g.push(this._parseAttributeValue(l,f[m])))}let y=p.map((m,_)=>({t:m,v:g[_]})).sort((m,_)=>m.t-_.t);s[d]={specType:r.Attribute,fields:{timeSamples:{times:y.map(m=>m.t),values:y.map(m=>m.v)},typeName:l}}}else{let u=this._parseAttributeValue(l,f),d=e+"."+c;s[d]?(s[d].fields.default=u,s[d].fields.typeName=l):s[d]={specType:r.Attribute,fields:{default:u,typeName:l}}}}}}_parseAttributeValue(t,e){if(e==null)return;let n=String(e).trim();if(t.endsWith("[]")){let s;try{let r=n.replace(/\(/g,"[").replace(/\)/g,"]");r.endsWith(",")&&(r=r.slice(0,-1));let a=JSON.parse(r);s=Array.isArray(a)&&Array.isArray(a[0])?a.flat():a}catch{s=n.replace(/[\[\]]/g,"").split(",").map(o=>{let l=o.trim(),c=parseFloat(l);return isNaN(c)?l.replace(/"/g,""):c})}if(t.startsWith("quat"))for(let r=0;r<s.length;r+=4){let a=s[r];s[r]=s[r+1],s[r+1]=s[r+2],s[r+2]=s[r+3],s[r+3]=a}return s}if(t.includes("3")||t.includes("2")||t.includes("4"))return n.replace(/[()]/g,"").split(",").map(a=>parseFloat(a.trim()));if(t.startsWith("quat")){let r=n.replace(/[()]/g,"").split(",").map(a=>parseFloat(a.trim()));return[r[1],r[2],r[3],r[0]]}return t.includes("matrix")?n.replace(/[()]/g,"").split(",").map(a=>parseFloat(a.trim())):t==="float"||t==="double"||t==="int"?parseFloat(n):t==="string"||t==="token"?this._parseString(n):t==="asset"?n.replace(/@/g,"").replace(/"/g,""):this._parseString(n)}_parseString(t){(t.startsWith('"')&&t.endsWith('"')||t.startsWith("'")&&t.endsWith("'"))&&(t=t.slice(1,-1));let e="",n=0;for(;n<t.length;)if(t[n]==="\\"&&n+1<t.length){let s=t[n+1];switch(s){case"n":e+=`
`;break;case"t":e+="	";break;case"r":e+="\r";break;case"\\":e+="\\";break;case'"':e+='"';break;case"'":e+="'";break;default:e+=s;break}n+=2}else e+=t[n],n++;return e}};var lh=new TextDecoder,Uf=new Float32Array(32);for(let i=0;i<32;i++)Uf[i]=Math.pow(2,i-15);var Ex=Math.pow(2,-14),Ct={Invalid:0,Bool:1,UChar:2,Int:3,UInt:4,Int64:5,UInt64:6,Half:7,Float:8,Double:9,String:10,Token:11,AssetPath:12,Matrix2d:13,Matrix3d:14,Matrix4d:15,Quatd:16,Quatf:17,Quath:18,Vec2d:19,Vec2f:20,Vec2h:21,Vec2i:22,Vec3d:23,Vec3f:24,Vec3h:25,Vec3i:26,Vec4d:27,Vec4f:28,Vec4h:29,Vec4i:30,Dictionary:31,TokenListOp:32,StringListOp:33,PathListOp:34,ReferenceListOp:35,IntListOp:36,Int64ListOp:37,UIntListOp:38,UInt64ListOp:39,PathVector:40,TokenVector:41,Specifier:42,Permission:43,Variability:44,VariantSelectionMap:45,TimeSamples:46,Payload:47,DoubleVector:48,LayerOffsetVector:49,StringVector:50,ValueBlock:51,Value:52,UnregisteredValue:53,UnregisteredValueListOp:54,PayloadListOp:55,TimeCode:56,PathExpression:57,Relocates:58,Spline:59,AnimationBlock:60},Cx=4294967295,Rx=105,Px=116;function Df(i,t,e,n,s,r){for(;t<e;){let a=i[t++];if(t>e)break;let o=a>>4;if(o===15){let u;do{if(t>=e)break;u=i[t++],o+=u}while(u===255&&t<e)}if(o>0){t+o>e&&(o=e-t);for(let u=0;u<o&&!(s>=r);u++)n[s++]=i[t++]}if(t>=e||t+2>e)break;let l=i[t++]|i[t++]<<8;if(l===0)break;let c=(a&15)+4;if(c===19){let u;do{if(t>=e)break;u=i[t++],c+=u}while(u===255&&t<e)}let f=s-l;if(f<0)break;for(let u=0;u<c&&!(s>=r);u++)n[s++]=n[f+u]}return s}function ch(i,t){let e=new Uint8Array(t),n=i[0];if(n===0)return Df(i,1,i.length,e,0,t),e;{let r=1,a=[];for(let c=0;c<n;c++){let f=(i[r]|i[r+1]<<8|i[r+2]<<16|i[r+3]<<24)>>>0;a.push(f),r+=4}let o=r,l=0;for(let c=0;c<n;c++){let f=a[c],u=Math.min(65536,t-l);Df(i,o,o+f,e,l,l+u),o+=f,l+=u}return e}}function Fn(i,t){let e=t*4+(t*2+7>>3)+4,n=ch(new Uint8Array(i),e);return Ix(n,t)}function Ix(i,t){let e=new DataView(i.buffer,i.byteOffset,i.byteLength),n=0,s=e.getInt32(n,!0);n+=4;let r=t*2+7>>3,a=n,o=n+r,l=new Int32Array(t),c=0,f=a,u=o;for(let d=0;d<t;){let p=i[f++];for(let g=0;g<4&&d<t;g++,d++){let y=p>>g*2&3,m=0;switch(y){case 0:m=s;break;case 1:m=e.getInt8(u),u+=1;break;case 2:m=e.getInt16(u,!0),u+=2;break;case 3:m=e.getInt32(u,!0),u+=4;break}c+=m,l[d]=c}}return l}var hh=class{constructor(t){this.buffer=t,this.view=new DataView(t),this.offset=0}seek(t){this.offset=t}tell(){return this.offset}readUint8(){let t=this.view.getUint8(this.offset);return this.offset+=1,t}readInt8(){let t=this.view.getInt8(this.offset);return this.offset+=1,t}readUint16(){let t=this.view.getUint16(this.offset,!0);return this.offset+=2,t}readInt16(){let t=this.view.getInt16(this.offset,!0);return this.offset+=2,t}readUint32(){let t=this.view.getUint32(this.offset,!0);return this.offset+=4,t}readInt32(){let t=this.view.getInt32(this.offset,!0);return this.offset+=4,t}readUint64(){let t=this.view.getUint32(this.offset,!0),e=this.view.getUint32(this.offset+4,!0);return this.offset+=8,e*4294967296+t}readInt64(){let t=this.view.getUint32(this.offset,!0),e=this.view.getInt32(this.offset+4,!0);return this.offset+=8,e*4294967296+t}readFloat32(){let t=this.view.getFloat32(this.offset,!0);return this.offset+=4,t}readFloat64(){let t=this.view.getFloat64(this.offset,!0);return this.offset+=8,t}readBytes(t){let e=new Uint8Array(this.buffer,this.offset,t);return this.offset+=t,e}readString(t){let e=this.readBytes(t),n=0;for(;n<t&&e[n]!==0;)n++;return lh.decode(e.subarray(0,n))}},ns=class{constructor(t,e){this.lo=t,this.hi=e}get isArray(){return(this.hi&2147483648)!==0}get isInlined(){return(this.hi&1073741824)!==0}get isCompressed(){return(this.hi&536870912)!==0}get typeEnum(){return this.hi>>16&255}get payload(){return this.lo+(this.hi&65535)*4294967296}getInlinedValue(){return this.lo}},hl=class{parseData(t){this.buffer=t instanceof ArrayBuffer?t:t.buffer,this.reader=new hh(this.buffer),this.version={major:0,minor:0,patch:0},this._conversionBuffer=new ArrayBuffer(4),this._conversionView=new DataView(this._conversionBuffer),this._readBootstrap(),this._readTOC(),this._readTokens(),this._readStrings(),this._readFields(),this._readFieldSets(),this._readPaths(),this._readSpecs(),this.specsByPath={};for(let e of this.specs){let n=this.paths[e.pathIndex];if(!n)continue;let s=this._getFieldsForSpec(e);this.specsByPath[n]={specType:e.specType,fields:s}}return{specsByPath:this.specsByPath}}_readBootstrap(){let t=this.reader;if(t.seek(0),t.readString(8)!=="PXR-USDC")throw new Error("THREE.USDCParser: Not a valid USDC file.");this.version.major=t.readUint8(),this.version.minor=t.readUint8(),this.version.patch=t.readUint8(),t.readBytes(5),this.tocOffset=t.readUint64()}_readTOC(){let t=this.reader;t.seek(this.tocOffset);let e=t.readUint64();this.sections={};for(let n=0;n<e;n++){let s=t.readString(16),r=t.readUint64(),a=t.readUint64();this.sections[s]={start:r,size:a}}}_readTokens(){let t=this.sections.TOKENS;if(!t)return;let e=this.reader;e.seek(t.start);let n=e.readUint64();if(this.tokens=[],this.version.major===0&&this.version.minor<4){let s=e.readUint64(),r=e.readBytes(s),a=0;for(let o=0;o<n;o++){let l=a;for(;l<r.length&&r[l]!==0;)l++;this.tokens.push(lh.decode(r.subarray(a,l))),a=l+1}}else{let s=e.readUint64(),r=e.readUint64(),a=e.readBytes(r),o=ch(a,s),l=0;for(let c=0;c<n;c++){let f=l;for(;f<o.length&&o[f]!==0;)f++;this.tokens.push(lh.decode(o.subarray(l,f))),l=f+1}}}_readStrings(){let t=this.sections.STRINGS;if(!t){this.strings=[];return}let e=this.reader;e.seek(t.start);let n=Math.floor(t.size/4);this.strings=[];for(let s=0;s<n;s++)this.strings.push(e.readUint32())}_readFields(){let t=this.sections.FIELDS;if(!t)return;let e=this.reader;if(e.seek(t.start),this.fields=[],this.version.major===0&&this.version.minor<4){let n=Math.floor(t.size/12);for(let s=0;s<n;s++){let r=e.readUint32(),a=e.readUint32(),o=e.readUint32();this.fields.push({tokenIndex:r,valueRep:new ns(a,o)})}}else{let n=e.readUint64(),s=e.readUint64(),r=e.readBytes(s),a=Fn(r.buffer.slice(r.byteOffset,r.byteOffset+s),n),o=e.readUint64(),l=e.readBytes(o),c=ch(l,n*8),f=new DataView(c.buffer,c.byteOffset,c.byteLength);for(let u=0;u<n;u++){let d=f.getUint32(u*8,!0),p=f.getUint32(u*8+4,!0);this.fields.push({tokenIndex:a[u],valueRep:new ns(d,p)})}}}_readFieldSets(){let t=this.sections.FIELDSETS;if(!t)return;let e=this.reader;if(e.seek(t.start),this.fieldSets=[],this.version.major===0&&this.version.minor<4){let n=Math.floor(t.size/4);for(let s=0;s<n;s++)this.fieldSets.push(e.readUint32())}else{let n=e.readUint64(),s=e.readUint64(),r=e.readBytes(s),a=Fn(r.buffer.slice(r.byteOffset,r.byteOffset+s),n);for(let o=0;o<n;o++)this.fieldSets.push(a[o])}}_readPaths(){let t=this.sections.PATHS;if(!t)return;let e=this.reader;e.seek(t.start);let n=e.readUint64();if(this.paths=new Array(n).fill(""),this.version.major===0&&this.version.minor<4)this._readPathsRecursive("");else{e.readUint64();let s=e.readUint64(),r=e.readBytes(s),a=Fn(r.buffer.slice(r.byteOffset,r.byteOffset+s),n),o=e.readUint64(),l=e.readBytes(o),c=Fn(l.buffer.slice(l.byteOffset,l.byteOffset+o),n),f=e.readUint64(),u=e.readBytes(f),d=Fn(u.buffer.slice(u.byteOffset,u.byteOffset+f),n);this._buildPathsFromCompressed(a,c,d)}}_readPathsRecursive(t,e=0){let n=this.reader;if(e>1e3)return;let s=n.readUint32(),r=n.readUint32(),a=n.readUint8(),o=(a&1)!==0,l=(a&2)!==0,c=(a&4)!==0,f;if(t==="")f="/";else{let u=this.tokens[r]||"";c?f=t+"."+u:f=t==="/"?"/"+u:t+"/"+u}if(this.paths[s]=f,o&&l){let u=n.readUint64();this._readPathsRecursive(f,e+1),n.seek(u),this._readPathsRecursive(t,e+1)}else o?this._readPathsRecursive(f,e+1):l&&this._readPathsRecursive(t,e+1)}_buildPathsFromCompressed(t,e,n){let s=(r,a)=>{let o=r;for(;o<t.length;){let l=o++,c=t[l],f=e[l],u=n[l],d;if(a==="")d="/",a=d;else{let y=this.tokens[Math.abs(f)]||"";f<0?d=a+"."+y:d=a==="/"?"/"+y:a+"/"+y}this.paths[c]=d;let p=u>0||u===-1,g=u>=0;if(p){if(g){let y=l+u;s(y,a)}a=d}else if(!g)break}};s(0,"")}_readSpecs(){let t=this.sections.SPECS;if(!t)return;let e=this.reader;if(e.seek(t.start),this.specs=[],this.version.major===0&&this.version.minor<4){let n=this.version.minor===0&&this.version.patch===1?16:12,s=Math.floor(t.size/n);for(let r=0;r<s;r++){let a=e.readUint32(),o=e.readUint32(),l=e.readUint32();n===16&&e.readUint32(),this.specs.push({pathIndex:a,fieldSetIndex:o,specType:l})}}else{let n=e.readUint64(),s=e.readUint64(),r=e.readBytes(s),a=Fn(r.buffer.slice(r.byteOffset,r.byteOffset+s),n),o=e.readUint64(),l=e.readBytes(o),c=Fn(l.buffer.slice(l.byteOffset,l.byteOffset+o),n),f=e.readUint64(),u=e.readBytes(f),d=Fn(u.buffer.slice(u.byteOffset,u.byteOffset+f),n);for(let p=0;p<n;p++)this.specs.push({pathIndex:a[p],fieldSetIndex:c[p],specType:d[p]})}}_readValue(t){let e=t.typeEnum,n=t.isArray,s=t.isInlined;if(e===Ct.TimeSamples)return this._readTimeSamples(t);if(s)return this._readInlinedValue(t);let r=t.payload;if(r===0&&n)return[];if(r<0||r>=this.buffer.byteLength)throw new RangeError("USDCParser: Invalid payload offset "+r+" for type "+e+".");let a=this.reader.tell();this.reader.seek(r);let o;return n?o=this._readArrayValue(t):o=this._readScalarValue(e),this.reader.seek(a),o}_readInlinedValue(t){let e=t.typeEnum,n=t.getInlinedValue(),s=this._conversionView;switch(e){case Ct.Bool:return n!==0;case Ct.UChar:return n&255;case Ct.Int:case Ct.UInt:return n;case Ct.Float:return s.setUint32(0,n,!0),s.getFloat32(0,!0);case Ct.Double:return s.setUint32(0,n,!0),s.getFloat32(0,!0);case Ct.Token:return this.tokens[n]||"";case Ct.String:return this.tokens[this.strings[n]]||"";case Ct.AssetPath:return this.tokens[n]||"";case Ct.Specifier:return n;case Ct.Permission:case Ct.Variability:return n;case Ct.Vec2h:return s.setUint32(0,n,!0),[this._halfToFloat(s.getUint16(0,!0)),this._halfToFloat(s.getUint16(2,!0))];case Ct.Vec2f:case Ct.Vec2i:return s.setUint32(0,n,!0),[s.getInt8(0),s.getInt8(1)];case Ct.Vec3f:case Ct.Vec3i:return s.setUint32(0,n,!0),[s.getInt8(0),s.getInt8(1),s.getInt8(2)];case Ct.Vec4f:case Ct.Vec4i:return s.setUint32(0,n,!0),[s.getInt8(0),s.getInt8(1),s.getInt8(2),s.getInt8(3)];case Ct.Matrix2d:{s.setUint32(0,n,!0);let r=s.getInt8(0),a=s.getInt8(1);return[r,0,0,a]}case Ct.Matrix3d:{s.setUint32(0,n,!0);let r=s.getInt8(0),a=s.getInt8(1),o=s.getInt8(2);return[r,0,0,0,a,0,0,0,o]}case Ct.Matrix4d:{s.setUint32(0,n,!0);let r=s.getInt8(0),a=s.getInt8(1),o=s.getInt8(2),l=s.getInt8(3);return[r,0,0,0,0,a,0,0,0,0,o,0,0,0,0,l]}default:return n}}_readTimeSamples(t){let e=this.reader,n=t.payload,s=e.tell();e.seek(n);let r=e.tell(),a=e.readInt64();e.seek(r+a);let o=e.readUint32(),l=e.readUint32(),c=new ns(o,l),f=this._readValue(c),u=r+a+8;e.seek(u);let d=e.tell(),p=e.readInt64();e.seek(d+p);let g=e.readUint64(),y=[];for(let R=0;R<g;R++){let w=e.readUint32(),v=e.readUint32();y.push(new ns(w,v))}let m=[];for(let R=0;R<g;R++)m.push(this._readValue(y[R]));return e.seek(s),{times:f instanceof Float64Array?Array.from(f):Array.isArray(f)?f:[f],values:m}}_readScalarValue(t){let e=this.reader;switch(t){case Ct.Invalid:return null;case Ct.Bool:return e.readUint8()!==0;case Ct.UChar:return e.readUint8();case Ct.Int:return e.readInt32();case Ct.UInt:return e.readUint32();case Ct.Int64:return e.readInt64();case Ct.UInt64:return e.readUint64();case Ct.Half:return this._readHalf();case Ct.Float:return e.readFloat32();case Ct.Double:return e.readFloat64();case Ct.String:case Ct.Token:{let n=e.readUint32();return this.tokens[n]||""}case Ct.AssetPath:{let n=e.readUint32();return this.tokens[n]||""}case Ct.Vec2f:return[e.readFloat32(),e.readFloat32()];case Ct.Vec2d:return[e.readFloat64(),e.readFloat64()];case Ct.Vec2i:return[e.readInt32(),e.readInt32()];case Ct.Vec3f:return[e.readFloat32(),e.readFloat32(),e.readFloat32()];case Ct.Vec3d:return[e.readFloat64(),e.readFloat64(),e.readFloat64()];case Ct.Vec3i:return[e.readInt32(),e.readInt32(),e.readInt32()];case Ct.Vec4f:return[e.readFloat32(),e.readFloat32(),e.readFloat32(),e.readFloat32()];case Ct.Vec4d:return[e.readFloat64(),e.readFloat64(),e.readFloat64(),e.readFloat64()];case Ct.Quatf:return[e.readFloat32(),e.readFloat32(),e.readFloat32(),e.readFloat32()];case Ct.Quatd:return[e.readFloat64(),e.readFloat64(),e.readFloat64(),e.readFloat64()];case Ct.Matrix4d:{let n=[];for(let s=0;s<16;s++)n.push(e.readFloat64());return n}case Ct.TokenVector:{let n=e.readUint64(),s=[];for(let r=0;r<n;r++){let a=e.readUint32();s.push(this.tokens[a]||"")}return s}case Ct.PathVector:{let n=e.readUint64(),s=[];for(let r=0;r<n;r++){let a=e.readUint32();s.push(this.paths[a]||"")}return s}case Ct.DoubleVector:{let n=e.readUint64(),s=new Float64Array(n);for(let r=0;r<n;r++)s[r]=e.readFloat64();return s}case Ct.Dictionary:{let n=e.readUint64(),s={};for(let r=0;r<n;r++){let a=e.readUint32(),o=this.tokens[a],l=e.position,c=e.readInt64(),f=l+c,u=e.position;e.position=f;let d=e.readUint64(),p=new ns(d),g=null;p.isInlined?g=this._readInlinedValue(p):p.isArray?(e.position=p.payload,g=this._readArrayValue(p)):(e.position=p.payload,g=this._readScalarValue(p.typeEnum)),e.position=u,o!==void 0&&g!==null&&(s[o]=g)}return s}case Ct.TokenListOp:case Ct.StringListOp:case Ct.IntListOp:case Ct.Int64ListOp:case Ct.UIntListOp:case Ct.UInt64ListOp:return null;case Ct.PathListOp:{let n=e.readUint8(),s=(n&2)!==0,r=(n&4)!==0,a=(n&8)!==0,o=(n&16)!==0,l=(n&32)!==0,c=(n&64)!==0,f=()=>{let y=e.readUint64(),m=[];for(let _=0;_<y;_++){let R=e.readUint32();m.push(this.paths[R])}return m},u=null,d=null,p=null,g=null;return s&&(u=f()),r&&(d=f()),l&&(p=f()),c&&(g=f()),a&&f(),o&&f(),p&&p.length>0?p:u&&u.length>0?u:g&&g.length>0?g:d&&d.length>0?d:null}case Ct.VariantSelectionMap:{let n=e.readUint64(),s={};for(let r=0;r<n;r++){let a=e.readUint32(),o=e.readUint32(),l=this.tokens[this.strings[a]],c=this.tokens[this.strings[o]];l&&c&&(s[l]=c)}return s}default:return console.warn("USDCParser: Unsupported scalar type",t),null}}_readArrayValue(t){let e=this.reader,n=t.typeEnum,s=t.isCompressed,r;if(this.version.major===0&&this.version.minor<7?r=e.readUint32():r=e.readUint64(),!Number.isSafeInteger(r)||r<0)throw new RangeError("USDCParser: Invalid array size "+r+" for type "+n+".");if(r>2147483647)throw new RangeError("USDCParser: Array size "+r+" exceeds implementation limits.");if(r===0)return[];if(s)return this._readCompressedArray(n,r);switch(n){case Ct.Int:{let a=new Int32Array(r);for(let o=0;o<r;o++)a[o]=e.readInt32();return a}case Ct.UInt:{let a=new Uint32Array(r);for(let o=0;o<r;o++)a[o]=e.readUint32();return a}case Ct.Float:{let a=new Float32Array(r);for(let o=0;o<r;o++)a[o]=e.readFloat32();return a}case Ct.Double:{let a=new Float64Array(r);for(let o=0;o<r;o++)a[o]=e.readFloat64();return a}case Ct.Vec2f:{let a=new Float32Array(r*2);for(let o=0;o<r*2;o++)a[o]=e.readFloat32();return a}case Ct.Vec3f:{let a=new Float32Array(r*3);for(let o=0;o<r*3;o++)a[o]=e.readFloat32();return a}case Ct.Vec4f:{let a=new Float32Array(r*4);for(let o=0;o<r*4;o++)a[o]=e.readFloat32();return a}case Ct.Vec3h:{let a=new Float32Array(r*3);for(let o=0;o<r*3;o++)a[o]=this._readHalf();return a}case Ct.Quatf:{let a=new Float32Array(r*4);for(let o=0;o<r*4;o++)a[o]=e.readFloat32();return a}case Ct.Quath:{let a=new Float32Array(r*4);for(let o=0;o<r*4;o++)a[o]=this._readHalf();return a}case Ct.Matrix4d:{let a=new Float64Array(r*16);for(let o=0;o<r*16;o++)a[o]=e.readFloat64();return a}case Ct.Token:{let a=[];for(let o=0;o<r;o++){let l=e.readUint32();a.push(this.tokens[l]||"")}return a}case Ct.Half:{let a=new Float32Array(r);for(let o=0;o<r;o++)a[o]=this._readHalf();return a}default:return console.warn("USDCParser: Unsupported array type",n),[]}}_readCompressedArray(t,e){let n=this.reader;switch(t){case Ct.Int:case Ct.UInt:{let s=n.readUint64(),r=n.readBytes(s);return Fn(r.buffer.slice(r.byteOffset,r.byteOffset+s),e)}case Ct.Float:{let s=n.readInt8();if(s===Rx){let r=n.readUint64(),a=n.readBytes(r),o=Fn(a.buffer.slice(a.byteOffset,a.byteOffset+r),e),l=new Float32Array(e);for(let c=0;c<e;c++)l[c]=o[c];return l}else if(s===Px){let r=n.readUint32(),a=new Float32Array(r);for(let u=0;u<r;u++)a[u]=n.readFloat32();let o=n.readUint64(),l=n.readBytes(o),c=Fn(l.buffer.slice(l.byteOffset,l.byteOffset+o),e),f=new Float32Array(e);for(let u=0;u<e;u++)f[u]=a[c[u]];return f}return console.warn("USDCParser: Unknown float compression code",s),new Float32Array(e)}default:return console.warn("USDCParser: Unsupported compressed array type",t),[]}}_readHalf(){return this._halfToFloat(this.reader.readUint16())}_halfToFloat(t){let e=(t&32768)>>15,n=(t&31744)>>10,s=t&1023;return n===0?s===0?e?-0:0:(e?-1:1)*Ex*(s/1024):n===31?s?NaN:e?-1/0:1/0:(e?-1:1)*Uf[n]*(1+s/1024)}_getFieldsForSpec(t){let e={},n=t.fieldSetIndex,s=1e4,r=0;for(;n<this.fieldSets.length&&r<s;){let a=this.fieldSets[n];if(a===Cx||a===-1)break;let o=this.fields[a];if(o){let l=this.tokens[o.tokenIndex],c=this._readValue(o.valueRep);e[l]=c}n++,r++}return e}};var Dx=/^(.+?)\/\{(\w+)=(\w+)\}\/(.+)$/,is={Unknown:0,Attribute:1,Connection:2,Expression:3,Mapper:4,MapperArg:5,Prim:6,PseudoRoot:7,Relationship:8,RelationshipTarget:9,Variant:10,VariantSet:11},On={projection:"perspective",clippingRange:[1,1e6],horizontalAperture:20.955,verticalAperture:15.2908,horizontalApertureOffset:0,verticalApertureOffset:0,focalLength:50,focusDistance:0,fStop:0},ss=class i{constructor(t=null){this.textureCache={},this.skinnedMeshes=[],this.manager=t,this.texturePromises=[]}compose(t,e={},n={},s=""){this.specsByPath=t.specsByPath,this.assets=e,this.externalVariantSelections=n,this.basePath=s,this.skinnedMeshes=[],this.skeletons={},this.texturePromises=[],this._buildIndexes();let r=this.specsByPath["/"],a=r?r.fields:{};this.fps=a.timeCodesPerSecond||a.framesPerSecond||24;let o=new zn;this._buildHierarchy(o,"/"),this._bindSkeletons();let l=Object.keys(this.skeletons);l.length===1&&(o.skeleton=this.skeletons[l[0]].skeleton),o.animations=this._buildAnimations();let c=a.metersPerUnit;return c!==void 0&&c!==1&&o.scale.setScalar(c),r&&r.fields&&r.fields.upAxis==="Z"&&(o.rotation.x=-Math.PI/2),o}applyTransform(t,e,n={}){let s={...e,...n},r=s.xformOpOrder;if(r&&r.length>0){let a=new se,o=new se,l=null;for(let c=0;c<r.length;c++){let f=r[c],u=f.startsWith("!invert!"),d=u?f.slice(8):f;if(d==="xformOp:transform"){let p=s["xformOp:transform"];p&&p.length===16&&(o.set(p[0],p[4],p[8],p[12],p[1],p[5],p[9],p[13],p[2],p[6],p[10],p[14],p[3],p[7],p[11],p[15]),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:translate"){let p=s["xformOp:translate"];p&&(o.makeTranslation(p[0],p[1],p[2]),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:translate:pivot"||d==="xformOp:translate:rotatePivot"){let p=s[d];p&&(o.makeTranslation(p[0],p[1],p[2]),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:scale"){let p=s["xformOp:scale"];p&&(Array.isArray(p)?(o.makeScale(p[0],p[1],p[2]),l=[p[0],p[1],p[2]]):(o.makeScale(p,p,p),l=[p,p,p]),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:rotateXYZ"){let p=s["xformOp:rotateXYZ"];if(p){let g=new gn(p[0]*Math.PI/180,p[1]*Math.PI/180,p[2]*Math.PI/180,"ZYX");o.makeRotationFromEuler(g),u&&o.invert(),a.multiply(o)}}else if(d==="xformOp:rotateX"){let p=s["xformOp:rotateX"];p!==void 0&&(o.makeRotationX(p*Math.PI/180),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:rotateY"){let p=s["xformOp:rotateY"];p!==void 0&&(o.makeRotationY(p*Math.PI/180),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:rotateZ"){let p=s["xformOp:rotateZ"];p!==void 0&&(o.makeRotationZ(p*Math.PI/180),u&&o.invert(),a.multiply(o))}else if(d==="xformOp:orient"){let p=s["xformOp:orient"];if(p&&p.length===4){let g=new We(p[0],p[1],p[2],p[3]);o.makeRotationFromQuaternion(g),u&&o.invert(),a.multiply(o)}}}if(t.matrix.copy(a),t.matrix.decompose(t.position,t.quaternion,t.scale),l){let c=l[0]<0,f=l[1]<0,u=l[2]<0;(c?1:0)+(f?1:0)+(u?1:0)===3&&(t.scale.set(l[0],l[1],l[2]),t.quaternion.set(t.quaternion.x,-t.quaternion.y,t.quaternion.z,-t.quaternion.w))}return}if(s["xformOp:translate"]){let a=s["xformOp:translate"];t.position.set(a[0],a[1],a[2])}if(s["xformOp:translate:pivot"]){let a=s["xformOp:translate:pivot"];t.pivot=new H(a[0],a[1],a[2])}if(s["xformOp:scale"]){let a=s["xformOp:scale"];Array.isArray(a)?t.scale.set(a[0],a[1],a[2]):t.scale.set(a,a,a)}if(s["xformOp:rotateXYZ"]){let a=s["xformOp:rotateXYZ"];t.rotation.set(a[0]*Math.PI/180,a[1]*Math.PI/180,a[2]*Math.PI/180)}if(s["xformOp:orient"]){let a=s["xformOp:orient"];a.length===4&&t.quaternion.set(a[0],a[1],a[2],a[3])}}_buildIndexes(){this.childrenByPath=new Map,this.attributesByPrimPath=new Map,this.materialsByRoot=new Map,this.shadersByMaterialPath=new Map,this.geomSubsetsByMeshPath=new Map;for(let t in this.specsByPath){let e=this.specsByPath[t];if(e.specType===is.Prim){let n=t.lastIndexOf("/");if(n>0){let r=t.slice(0,n),a=t.slice(n+1);this.childrenByPath.has(r)||this.childrenByPath.set(r,[]),this.childrenByPath.get(r).push({name:a,path:t})}else if(n===0&&t.length>1){let r=t.slice(1);this.childrenByPath.has("/")||this.childrenByPath.set("/",[]),this.childrenByPath.get("/").push({name:r,path:t})}let s=e.fields.typeName;if(s==="Material"){let r=t.split("/"),a=r.length>1?"/"+r[1]:"/";this.materialsByRoot.has(a)||this.materialsByRoot.set(a,[]),this.materialsByRoot.get(a).push(t)}if(s==="Shader"&&n>0){let r=t.slice(0,n);for(;r.length>0;){let a=this.specsByPath[r];if(a&&a.specType===is.Prim&&a.fields.typeName==="Material"){this.shadersByMaterialPath.has(r)||this.shadersByMaterialPath.set(r,[]),this.shadersByMaterialPath.get(r).push(t);break}let o=r.lastIndexOf("/");if(o<=0)break;r=r.slice(0,o)}}if(s==="GeomSubset"&&n>0){let r=t.slice(0,n);this.geomSubsetsByMeshPath.has(r)||this.geomSubsetsByMeshPath.set(r,[]),this.geomSubsetsByMeshPath.get(r).push(t)}}else if(e.specType===is.Attribute||e.specType===is.Relationship){let n=t.lastIndexOf(".");if(n>0){let s=t.slice(0,n),r=t.slice(n+1);this.attributesByPrimPath.has(s)||this.attributesByPrimPath.set(s,new Map),this.attributesByPrimPath.get(s).set(r,e)}}}}_isDirectChild(t,e,n){if(!e.startsWith(n))return!1;let s=e.slice(n.length);return s.length===0||s.startsWith("{")?!1:!s.includes("/")}_buildHierarchy(t,e){let n=[],s=new Set,r=this.childrenByPath.get(e);if(r)for(let o of r)s.has(o.path)||(s.add(o.path),n.push(o));let a=this._getVariantPaths(e);for(let o of a){let l=this.childrenByPath.get(o);if(l)for(let c of l)s.has(c.path)||(s.add(c.path),n.push(c))}for(let{name:o,path:l}of n){let c=this.specsByPath[l];if(!c||c.specType!==is.Prim)continue;let f=c.fields.typeName,u=this._getReferences(c);if(u.length>0){let d=this._getLocalVariantSelections(c.fields),p=[];for(let g of u){let y=this._resolveReference(g,d);y&&p.push(y)}if(p.length>0){let g=this._getAttributes(l);if(p.length===1){let m=this._findSingleMesh(p[0]);if(m&&(f==="Xform"||!f)){m.name=o,this.applyTransform(m,c.fields,g),this._applyMaterialBinding(m,l),t.add(m),this._buildHierarchy(m,l);continue}}let y=new we;y.name=o,this.applyTransform(y,c.fields,g);for(let m of p)for(;m.children.length>0;)y.add(m.children[0]);t.add(y),this._buildHierarchy(y,l);continue}}if(f==="SkelRoot"){let d=new we;d.name=o,d.userData.isSkelRoot=!0;let p=this._getAttributes(l);this.applyTransform(d,c.fields,p),t.add(d),this._buildHierarchy(d,l)}else if(f==="Skeleton"){let d=this._buildSkeleton(l);d&&(this.skeletons[l]=d),this._buildHierarchy(t,l)}else if(f!=="SkelAnimation"){if(f==="Mesh"){let d=this._buildMesh(l,c);d&&(t.add(d),this._buildHierarchy(d,l))}else if(f==="Camera"){let d=this._buildCamera(l);d.name=o;let p=this._getAttributes(l);this.applyTransform(d,c.fields,p),t.add(d),this._buildHierarchy(d,l)}else if(f==="DistantLight"||f==="SphereLight"||f==="RectLight"||f==="DiskLight"){let d=this._buildLight(l,f);d.name=o;let p=this._getAttributes(l);this.applyTransform(d,c.fields,p),t.add(d),this._buildHierarchy(d,l)}else if(f==="Cube"||f==="Sphere"||f==="Cylinder"||f==="Cone"||f==="Capsule"){let d=this._buildGeomPrimitive(l,c,f);d&&(t.add(d),this._buildHierarchy(d,l))}else if(!(f==="Material"||f==="Shader"||f==="GeomSubset")){let d=new we;d.name=o;let p=this._getAttributes(l);this.applyTransform(d,c.fields,p),t.add(d),this._buildHierarchy(d,l)}}}}_getVariantPaths(t){let e=this.specsByPath[t],n=e?.fields?.variantSetChildren,s=[];if(!n||n.length===0)return s;for(let r of n){let a=this.externalVariantSelections[r]||null;if(!a){let o=e.fields.variantSelection;a=o?o[r]:null}if(!a){let o=t+"/{"+r+"=}",l=this.specsByPath[o];l?.fields?.variantChildren&&(a=l.fields.variantChildren[0])}if(a){let o=t+"/{"+r+"="+a+"}";s.push(o)}}return s}_resolveFilePath(t){let e=t;if(e.startsWith("./")&&(e=e.slice(2)),!this.basePath)return e;let n=this.basePath.endsWith("/")?this.basePath:this.basePath+"/";return ji.resolveURL(e,n)}_resolveReference(t,e={}){if(!t)return null;let n=t.match(/@([^@]+)@(?:<([^>]+)>)?/);if(!n)return null;let s=n[1],r=n[2],a=this._resolveFilePath(s),o={...e,...this.externalVariantSelections},l=this.assets[a];if(!l)return null;if(l.specsByPath){let c=new i(this.manager),f=this._getBasePath(a),u=c.compose(l,this.assets,o,f);if(r){let d=r.split("/").pop(),p=null;for(let g of u.children)if(g.name===d){p=g;break}if(p){u.remove(p);let g=new zn;return g.add(p),g}}return u}return l.isGroup||l.isObject3D?l.clone():null}_findSingleMesh(t){for(let e of t.children)if(e.isMesh)return t.remove(e),e;if(t.children.length===1){let e=t.children[0];if(e.children&&e.children.length===1){let n=e.children[0];if(n.isMesh&&!this._hasNonIdentityTransform(e))return e.remove(n),n}}return null}_hasNonIdentityTransform(t){let e=t.position,n=t.rotation,s=t.scale,r=e.x!==0||e.y!==0||e.z!==0,a=n.x!==0||n.y!==0||n.z!==0,o=s.x!==1||s.y!==1||s.z!==1;return r||a||o}_getBasePath(t){let e=t.lastIndexOf("/");return e>=0?t.slice(0,e):""}_getLocalVariantSelections(t){let e={};if(t.variantSelection)for(let n in t.variantSelection)e[n]=t.variantSelection[n];return e}_getReferences(t){let e=[];if(t.fields.references&&t.fields.references.length>0){let n=t.fields.references[0];if(typeof n=="string"){let s=n.matchAll(/@([^@]+)@(?:<([^>]+)>)?/g);for(let r of s)e.push(r[0])}else n.assetPath&&e.push("@"+n.assetPath+"@")}if(e.length===0&&t.fields.payload){let n=t.fields.payload;typeof n=="string"?e.push(n):n.assetPath&&e.push("@"+n.assetPath+"@")}return e}_getAttributes(t){let e={};this._collectAttributesFromPath(t,e);let n=t.match(Dx);if(n){let s=n[1],r=n[4],a=this._getVariantPaths(s);for(let o of a){if(t.startsWith(o))continue;let l=o+"/"+r;this._collectAttributesFromPath(l,e)}}else{let s=t.split("/");for(let r=1;r<s.length-1;r++){let a=s.slice(0,r+1).join("/"),o=s.slice(r+1).join("/"),l=this._getVariantPaths(a);for(let c of l){let f=c+"/"+o;this._collectAttributesFromPath(f,e)}}}return e}_collectAttributesFromPath(t,e){let n=this.attributesByPrimPath.get(t);if(n)for(let[s,r]of n){if(r.fields?.default!==void 0)e[s]=r.fields.default;else if(r.fields?.timeSamples){let{times:a,values:o}=r.fields.timeSamples;if(a&&o&&a.length>0){let l=a.indexOf(0);e[s]=l>=0?o[l]:o[0]}}r.fields?.elementSize!==void 0&&(e[s+":elementSize"]=r.fields.elementSize),s.startsWith("primvars:")&&r.fields?.typeName!==void 0&&(e[s+":typeName"]=r.fields.typeName)}}_buildGeomPrimitive(t,e,n){let s=this._getAttributes(t),r=t.split("/").pop(),a;switch(n){case"Cube":{let f=s.size||2;a=new Hn(f,f,f);break}case"Sphere":{let f=s.radius||1;a=new Rr(f,32,16);break}case"Cylinder":{let f=s.height||2,u=s.radius||1;a=new Us(u,u,f,32);break}case"Cone":{let f=s.height||2,u=s.radius||1;a=new wr(u,f,32);break}case"Capsule":{let f=s.height||1,u=s.radius||.5;a=new br(u,f,16,32);break}}let o=s.axis||"Z";o==="X"?a.rotateZ(-Math.PI/2):o==="Z"&&a.rotateX(Math.PI/2);let l=this._buildMaterial(t,e.fields),c=new ve(a,l);return c.name=r,this.applyTransform(c,e.fields,s),c}_buildMesh(t,e){let n=this._getAttributes(t),s=n["primvars:skel:jointIndices"],r=n["primvars:skel:jointWeights"],a=s&&r&&s.length>0&&r.length>0,o=this._getGeomSubsets(t),l,c;if(o.length>0){l=this._buildGeometryWithSubsets(n,o,a);let p=this._getMaterialPath(t,e.fields);c=o.map(g=>{let y=g.materialPath||p;return this._buildMaterialForPath(y)})}else l=this._buildGeometry(t,n,a),c=this._buildMaterial(t,e.fields);let f=n["primvars:displayColor"];if(f&&f.length>=3){let p=g=>{g.color&&g.color.r===1&&g.color.g===1&&g.color.b===1&&!g.map&&g.color.setRGB(f[0],f[1],f[2],pe)};Array.isArray(c)?c.forEach(p):p(c)}let u=n["primvars:displayOpacity"];if(u&&u.length===1&&o.length===0){let p=u[0],g=y=>{p<1&&y.opacity===1&&y.transparent===!1&&(y.opacity=p,y.transparent=!0)};Array.isArray(c)?c.forEach(g):g(c)}let d;if(a){d=new _r(l,c);let p=this.specsByPath[t+".skel:skeleton"];p||(p=this.specsByPath[t+".rel skel:skeleton"]);let g=null;p&&(p.fields.targetPaths&&p.fields.targetPaths.length>0?g=p.fields.targetPaths[0]:p.fields.default&&(g=p.fields.default.replace(/<|>/g,"")));let y=n["skel:joints"],m=n["primvars:skel:geomBindTransform"];this.skinnedMeshes.push({mesh:d,skeletonPath:g,path:t,localJoints:y,geomBindTransform:m})}else d=new ve(l,c);return d.name=t.split("/").pop(),this.applyTransform(d,e.fields,n),d}_buildCamera(t){let e=this._getAttributes(t),n=e.projection,s=typeof n=="string"?n.toLowerCase():On.projection,r=e.clippingRange||On.clippingRange,a=Math.max(Number.EPSILON,this._parseNumber(r[0],On.clippingRange[0])),o=Math.max(a+Number.EPSILON,this._parseNumber(r[1],On.clippingRange[1])),l=this._parseNumber(e.horizontalAperture,On.horizontalAperture),c=this._parseNumber(e.verticalAperture,On.verticalAperture),f=this._parseNumber(e.horizontalApertureOffset,On.horizontalApertureOffset),u=this._parseNumber(e.verticalApertureOffset,On.verticalApertureOffset),d=this._parseNumber(e.focalLength,On.focalLength),p=this._parseNumber(e.focusDistance,On.focusDistance),g=this._parseNumber(e.fStop,On.fStop),y;if(s==="orthographic"){let m=l/10,_=c/10,R=f/10,w=u/10;y=new ui(R-m*.5,R+m*.5,w+_*.5,w-_*.5,a,o)}else{let m=Math.max(Number.EPSILON,c),_=Math.max(Number.EPSILON,d),R=l/m,w=2*Math.atan(m/(2*_))*180/Math.PI;y=new Ge(w,R,a,o),y.filmGauge=Math.max(l,c),y.filmOffset=f,y.focus=p,y.setFocalLength(_),u!==0&&(y.userData.verticalApertureOffset=u)}return y.userData.fStop=g,y.userData.usdProjection=s,y}_buildLight(t,e){let n=this._getAttributes(t),s=this._parseNumber(n["inputs:intensity"],1),r=n["inputs:color"]||[1,1,1],a=n["inputs:enableColorTemperature"]===!0,o=this._parseNumber(n["inputs:colorTemperature"],6500),l=new ie(r[0],r[1],r[2]);if(a){let f=this._colorTemperature(o);l.multiply(f)}let c;switch(e){case"DistantLight":c=new Fr(l,s);break;case"SphereLight":{let f=this._parseNumber(n["shaping:cone:angle"],0);if(f>0){let u=f*Math.PI/180,d=this._parseNumber(n["shaping:cone:softness"],0);c=new Nr(l,s,0,u,d)}else c=new $i(l,s);break}case"RectLight":{let f=this._parseNumber(n["inputs:width"],1),u=this._parseNumber(n["inputs:height"],1);c=new ks(l,s,f,u);break}case"DiskLight":{let u=this._parseNumber(n["inputs:radius"],.5)*2;c=new ks(l,s,u,u);break}}return c}_colorTemperature(t){let e=t/100,n,s,r;return e<=66?(n=1,s=.3900815787690196*Math.log(e)-.6318414437886275):(n=1.292936186062745*Math.pow(e-60,-.1332047592),s=1.1298908608952942*Math.pow(e-60,-.0755148492)),e>=66?r=1:e<=19?r=0:r=.543206789110196*Math.log(e-10)-1.19625408914,new ie(Math.min(Math.max(n,0),1),Math.min(Math.max(s,0),1),Math.min(Math.max(r,0),1))}_parseNumber(t,e){let n=Number(t);return Number.isFinite(n)?n:e}_getGeomSubsets(t){let e=[],n=this.geomSubsetsByMeshPath.get(t);if(!n)return e;for(let s of n){let a=this._getAttributes(s).indices;if(!a||a.length===0)continue;let o=this._getMaterialBindingTarget(s);e.push({name:s.split("/").pop(),indices:a,materialPath:o})}return e}_getMaterialBindingTarget(t){let e="material:binding",n=t+"."+e,s=this.specsByPath[n];if(s?.fields?.targetPaths?.length>0)return s.fields.targetPaths[0];let r=t.split("/");for(let a=1;a<r.length;a++){let o=r.slice(0,a+1).join("/"),l=r.slice(a+1).join("/"),c=this._getVariantPaths(o);for(let f of c){let u=l?f+"/"+l+"."+e:f+"."+e,d=this.specsByPath[u];if(d?.fields?.targetPaths?.length>0)return d.fields.targetPaths[0]}}return null}_buildGeometry(t,e,n=!1){let s=new tn,r=e.points;if(!r||r.length===0)return s;let a=e.faceVertexIndices,o=e.faceVertexCounts,l=e["primvars:arnold:polygon_holes"],c=this._buildHoleMap(l),f=a,u=null;if(o&&o.length>0){let v=this._triangulateIndicesWithPattern(a,o,r,c);f=v.indices,u=v.pattern}let d=r;f&&f.length>0&&(d=this._expandAttribute(r,f,3)),s.setAttribute("position",new xe(new Float32Array(d),3));let p=e.normals||e["primvars:normals"],g=e["normals:indices"]||e["primvars:normals:indices"];if(p&&p.length>0){let v=p;if(g&&g.length>0&&u){let E=this._applyTriangulationPattern(g,u);v=this._expandAttribute(p,E,3)}else if(p.length===r.length)f&&f.length>0&&(v=this._expandAttribute(p,f,3));else if(u){let E=this._applyTriangulationPattern(Array.from({length:p.length/3},(C,D)=>D),u);v=this._expandAttribute(p,E,3)}s.setAttribute("normal",new xe(new Float32Array(v),3))}else{let v=this._computeVertexNormals(r,f);s.setAttribute("normal",new xe(new Float32Array(this._expandAttribute(v,f,3)),3))}let{uvs:y,uvIndices:m}=this._findUVPrimvar(e),_=a?a.length:0;if(y&&y.length>0){let v=y;if(m&&m.length>0&&u){let E=this._applyTriangulationPattern(m,u);v=this._expandAttribute(y,E,2)}else if(f&&y.length/2===r.length/3)v=this._expandAttribute(y,f,2);else if(u&&y.length/2===_){let E=this._applyTriangulationPattern(Array.from({length:_},(C,D)=>D),u);v=this._expandAttribute(y,E,2)}s.setAttribute("uv",new xe(new Float32Array(v),2))}let{uvs2:R,uv2Indices:w}=this._findUV2Primvar(e);if(R&&R.length>0){let v=R;if(w&&w.length>0&&u){let E=this._applyTriangulationPattern(w,u);v=this._expandAttribute(R,E,2)}else if(f&&R.length/2===r.length/3)v=this._expandAttribute(R,f,2);else if(u&&R.length/2===_){let E=this._applyTriangulationPattern(Array.from({length:_},(C,D)=>D),u);v=this._expandAttribute(R,E,2)}s.setAttribute("uv1",new xe(new Float32Array(v),2))}if(n){let v=e["primvars:skel:jointIndices"],E=e["primvars:skel:jointWeights"],C=e["primvars:skel:jointIndices:elementSize"]||4;if(v&&E){let D=d.length/3,S,T;f&&f.length>0?(S=this._expandAttribute(v,f,C),T=this._expandAttribute(E,f,C)):(S=v,T=E);let L=new Uint16Array(D*4),N=new Float32Array(D*4);this._selectTopWeights(S,T,C,D,L,N),s.setAttribute("skinIndex",new xe(L,4)),s.setAttribute("skinWeight",new xe(N,4))}}return s}_buildGeometryWithSubsets(t,e,n=!1){let s=new tn,r=t.points;if(!r||r.length===0)return s;let a=t.faceVertexIndices,o=t.faceVertexCounts;if(!o||o.length===0)return s;let l=t["primvars:arnold:polygon_holes"],c=this._buildHoleMap(l),f=c.holeFaces,u=c.parentToHoles,{uvs:d,uvIndices:p}=this._findUVPrimvar(t),{uvs2:g,uv2Indices:y}=this._findUV2Primvar(t),m=t.normals||t["primvars:normals"],_=t["normals:indices"]||t["primvars:normals:indices"],R=n?t["primvars:skel:jointIndices"]:null,w=n?t["primvars:skel:jointWeights"]:null,v=t["primvars:skel:jointIndices:elementSize"]||4,E=[],C=0;for(let gt=0;gt<o.length;gt++){if(E.push(C),f.has(gt))continue;let Nt=o[gt],Lt=u.get(gt);if(Lt&&Lt.length>0){let re=Nt;for(let Dt of Lt)re+=o[Dt];C+=re-2}else Nt>=3&&(C+=Nt-2)}let D=new Int32Array(C).fill(-1);for(let gt=0;gt<e.length;gt++){let Nt=e[gt];for(let Lt=0;Lt<Nt.indices.length;Lt++){let re=Nt.indices[Lt];if(re>=o.length)continue;let Dt=E[re],$t=o[re]-2;for(let Zt=0;Zt<$t;Zt++)D[Dt+Zt]=gt}}let S=[];for(let gt=0;gt<C;gt++)S.push({original:gt,subset:D[gt]});S.sort((gt,Nt)=>gt.subset-Nt.subset);let T=[],L=S.length>0?S[0].subset:-1,N=0;for(let gt=0;gt<S.length;gt++)S[gt].subset!==L&&(L>=0&&T.push({start:N*3,count:(gt-N)*3,materialIndex:L}),L=S[gt].subset,N=gt);L>=0&&S.length>N&&T.push({start:N*3,count:(S.length-N)*3,materialIndex:L});for(let gt of T)s.addGroup(gt.start,gt.count,gt.materialIndex);let{indices:F,pattern:Y}=this._triangulateIndicesWithPattern(a,o,r,c),J=o.reduce((gt,Nt)=>gt+Nt,0),O=d&&!p&&d.length/2===J||g&&!y&&g.length/2===J?this._applyTriangulationPattern(Array.from({length:J},(gt,Nt)=>Nt),Y):null,K=p?this._applyTriangulationPattern(p,Y):d&&d.length/2===J?O:null,Z=y?this._applyTriangulationPattern(y,Y):g&&g.length/2===J?O:null,st=m&&_&&_.length>0,lt=m&&m.length/3===J,St=st?this._applyTriangulationPattern(_,Y):lt?this._applyTriangulationPattern(Array.from({length:J},(gt,Nt)=>Nt),Y):null,mt=!m&&F.length>0?this._computeVertexNormals(r,F):null,vt=C*3,qt=new Float32Array(vt*3),Qt=d?new Float32Array(vt*2):null,kt=g?new Float32Array(vt*2):null,tt=m||mt?new Float32Array(vt*3):null,ot=R?new Uint16Array(vt*v):null,ht=w?new Float32Array(vt*v):null;for(let gt=0;gt<S.length;gt++){let Nt=S[gt].original;for(let Lt=0;Lt<3;Lt++){let re=Nt*3+Lt,Dt=gt*3+Lt,$t=F[re];if(qt[Dt*3]=r[$t*3],qt[Dt*3+1]=r[$t*3+1],qt[Dt*3+2]=r[$t*3+2],Qt&&d)if(K){let Zt=K[re];Qt[Dt*2]=d[Zt*2],Qt[Dt*2+1]=d[Zt*2+1]}else d.length/2===r.length/3&&(Qt[Dt*2]=d[$t*2],Qt[Dt*2+1]=d[$t*2+1]);if(kt&&g)if(Z){let Zt=Z[re];kt[Dt*2]=g[Zt*2],kt[Dt*2+1]=g[Zt*2+1]}else g.length/2===r.length/3&&(kt[Dt*2]=g[$t*2],kt[Dt*2+1]=g[$t*2+1]);if(tt)if(m&&St){let Zt=St[re];tt[Dt*3]=m[Zt*3],tt[Dt*3+1]=m[Zt*3+1],tt[Dt*3+2]=m[Zt*3+2]}else m&&m.length===r.length?(tt[Dt*3]=m[$t*3],tt[Dt*3+1]=m[$t*3+1],tt[Dt*3+2]=m[$t*3+2]):mt&&(tt[Dt*3]=mt[$t*3],tt[Dt*3+1]=mt[$t*3+1],tt[Dt*3+2]=mt[$t*3+2]);if(ot&&ht&&R&&w)for(let Zt=0;Zt<v;Zt++)ot[Dt*v+Zt]=R[$t*v+Zt]||0,ht[Dt*v+Zt]=w[$t*v+Zt]||0}}if(s.setAttribute("position",new xe(qt,3)),Qt&&s.setAttribute("uv",new xe(Qt,2)),kt&&s.setAttribute("uv1",new xe(kt,2)),s.setAttribute("normal",new xe(tt,3)),ot&&ht){let gt=new Uint16Array(vt*4),Nt=new Float32Array(vt*4);this._selectTopWeights(ot,ht,v,vt,gt,Nt),s.setAttribute("skinIndex",new xe(gt,4)),s.setAttribute("skinWeight",new xe(Nt,4))}return s}_selectTopWeights(t,e,n,s,r,a){if(n<=4){for(let l=0;l<s;l++)for(let c=0;c<4;c++)c<n?(r[l*4+c]=t[l*n+c]||0,a[l*4+c]=e[l*n+c]||0):(r[l*4+c]=0,a[l*4+c]=0);return}let o=new Uint32Array(n);for(let l=0;l<s;l++){let c=l*n;for(let u=0;u<n;u++)o[u]=u;for(let u=0;u<4;u++){let d=u,p=e[c+o[u]]||0;for(let g=u+1;g<n;g++){let y=e[c+o[g]]||0;y>p&&(p=y,d=g)}if(d!==u){let g=o[u];o[u]=o[d],o[d]=g}}let f=0;for(let u=0;u<4;u++)f+=e[c+o[u]]||0;for(let u=0;u<4;u++){let d=o[u];f>0?(r[l*4+u]=t[c+d]||0,a[l*4+u]=(e[c+d]||0)/f):(r[l*4+u]=0,a[l*4+u]=0)}}}_findUVPrimvar(t){for(let s in t){if(!s.startsWith("primvars:")||s.endsWith(":typeName")||s.endsWith(":elementSize")||s.endsWith(":indices")||s.includes("skel:"))continue;let r=t[s+":typeName"];if(r&&r.includes("texCoord"))return{uvs:t[s],uvIndices:t[s+":indices"]}}let e=t["primvars:st"]||t["primvars:UVMap"],n=t["primvars:st:indices"];return{uvs:e,uvIndices:n}}_findUV2Primvar(t){let e=t["primvars:st1"],n=t["primvars:st1:indices"];return{uvs2:e,uv2Indices:n}}_buildHoleMap(t){if(!t||t.length===0)return{parentToHoles:new Map,holeFaces:new Set};let e=new Map,n=new Set;for(let s=0;s<t.length;s+=2){let r=t[s],a=t[s+1];n.add(r),e.has(a)||e.set(a,[]),e.get(a).push(r)}return{parentToHoles:e,holeFaces:n}}_triangulateIndicesWithPattern(t,e,n=null,s=null){let r=[],a=[],o=[],l=0;for(let d=0;d<e.length;d++)o.push(l),l+=e[d];let c=s?.parentToHoles||new Map,f=s?.holeFaces||new Set,u=0;for(let d=0;d<e.length;d++){let p=e[d];if(f.has(d)){u+=p;continue}let g=c.get(d);if(g&&g.length>0&&n&&n.length>0){let y=new Map,m=[];for(let w=0;w<p;w++){let v=t[u+w];m.push(v),y.set(v,u+w)}let _=[];for(let w of g){let v=o[w],E=e[w],C=[];for(let D=0;D<E;D++){let S=t[v+D];C.push(S),y.set(S,v+D)}_.push(C)}let R=this._triangulateNGonWithHoles(m,_,n);for(let w of R)r.push(w[0],w[1],w[2]),a.push(y.get(w[0]),y.get(w[1]),y.get(w[2]))}else if(p===3)r.push(t[u],t[u+1],t[u+2]),a.push(u,u+1,u+2);else if(p===4)r.push(t[u],t[u+1],t[u+2],t[u],t[u+2],t[u+3]),a.push(u,u+1,u+2,u,u+2,u+3);else if(p>4)if(n&&n.length>0){let y=[];for(let _=0;_<p;_++)y.push(t[u+_]);let m=this._triangulateNGon(y,n);for(let _ of m)r.push(_[0],_[1],_[2]),a.push(u+y.indexOf(_[0]),u+y.indexOf(_[1]),u+y.indexOf(_[2]))}else for(let y=1;y<p-1;y++)r.push(t[u],t[u+y],t[u+y+1]),a.push(u,u+y,u+y+1);u+=p}return{indices:r,pattern:a}}_applyTriangulationPattern(t,e){let n=[];for(let s=0;s<e.length;s++)n.push(t[e[s]]);return n}_triangulateNGon(t,e){let n=[],s=[];for(let f of t)s.push(new H(e[f*3],e[f*3+1],e[f*3+2]));let r=new H;for(let f=0;f<s.length;f++){let u=s[f],d=s[(f+1)%s.length];r.x+=(u.y-d.y)*(u.z+d.z),r.y+=(u.z-d.z)*(u.x+d.x),r.z+=(u.x-d.x)*(u.y+d.y)}r.normalize();let a=new H,o=new H;Math.abs(r.y)>.9?a.set(1,0,0):a.set(0,1,0),o.crossVectors(r,a).normalize(),a.crossVectors(o,r).normalize();for(let f of s)n.push(new Kt(f.dot(a),f.dot(o)));let l=Ns.triangulateShape(n,[]),c=[];for(let f of l)c.push([t[f[0]],t[f[1]],t[f[2]]]);return c}_triangulateNGonWithHoles(t,e,n){let s=[];for(let p of t)s.push(new H(n[p*3],n[p*3+1],n[p*3+2]));let r=new H;for(let p=0;p<s.length;p++){let g=s[p],y=s[(p+1)%s.length];r.x+=(g.y-y.y)*(g.z+y.z),r.y+=(g.z-y.z)*(g.x+y.x),r.z+=(g.x-y.x)*(g.y+y.y)}r.normalize();let a=new H,o=new H;Math.abs(r.y)>.9?a.set(1,0,0):a.set(0,1,0),o.crossVectors(r,a).normalize(),a.crossVectors(o,r).normalize();let l=[];for(let p of s)l.push(new Kt(p.dot(a),p.dot(o)));let c=[];for(let p of e){let g=[];for(let y of p){let m=new H(n[y*3],n[y*3+1],n[y*3+2]);g.push(new Kt(m.dot(a),m.dot(o)))}c.push(g)}let f=[...t];for(let p of e)f.push(...p);let u=Ns.triangulateShape(l,c),d=[];for(let p of u)d.push([f[p[0]],f[p[1]],f[p[2]]]);return d}_triangulateIndices(t,e){let n=[],s=0;for(let r=0;r<e.length;r++){let a=e[r];if(a===3)n.push(t[s],t[s+1],t[s+2]);else if(a===4)n.push(t[s],t[s+1],t[s+2],t[s],t[s+2],t[s+3]);else if(a>4)for(let o=1;o<a-1;o++)n.push(t[s],t[s+o],t[s+o+1]);s+=a}return n}_expandAttribute(t,e,n){let s=new Array(e.length*n);for(let r=0;r<e.length;r++){let a=e[r];for(let o=0;o<n;o++)s[r*n+o]=t[a*n+o]}return s}_computeVertexNormals(t,e){let n=t.length/3,s=new Float32Array(n*3);for(let r=0;r<e.length;r+=3){let a=e[r],o=e[r+1],l=e[r+2],c=t[a*3],f=t[a*3+1],u=t[a*3+2],d=t[o*3],p=t[o*3+1],g=t[o*3+2],y=t[l*3],m=t[l*3+1],_=t[l*3+2],R=d-c,w=p-f,v=g-u,E=y-c,C=m-f,D=_-u,S=w*D-v*C,T=v*E-R*D,L=R*C-w*E;s[a*3]+=S,s[a*3+1]+=T,s[a*3+2]+=L,s[o*3]+=S,s[o*3+1]+=T,s[o*3+2]+=L,s[l*3]+=S,s[l*3+1]+=T,s[l*3+2]+=L}for(let r=0;r<n;r++){let a=s[r*3],o=s[r*3+1],l=s[r*3+2],c=Math.sqrt(a*a+o*o+l*l);c>0&&(s[r*3]/=c,s[r*3+1]/=c,s[r*3+2]/=c)}return s}_getMaterialPath(t,e){let n=null,s=e["material:binding"];return s&&(n=Array.isArray(s)?s[0]:s),n||(n=this._getMaterialBindingTarget(t)),n}_buildMaterial(t,e){let n=new Ji,s=null,r=e["material:binding"];if(r&&(s=Array.isArray(r)?r[0]:r),s||(s=this._getMaterialBindingTarget(t)),!s){let a=[],o=t+"/";for(let l in this.specsByPath){if(!l.startsWith(o)||!l.endsWith(".material:binding"))continue;let c=this.specsByPath[l];if(!c)continue;let f=c.fields.targetPaths;f&&f.length>0&&a.push(f[0])}a.length>0&&(s=this._pickBestMaterial(a))}if(!s){let o="/"+t.split("/")[1],l=this.materialsByRoot.get(o);if(l){for(let c of l)if(c.startsWith(o+"/Looks/")||c.startsWith(o+"/Materials/")){s=c;break}}}return s&&this._applyMaterial(n,s),n}_buildMaterialForPath(t){let e=new Ji;return t&&this._applyMaterial(e,t),e}_applyMaterialBinding(t,e){let n=e+".material:binding",s=this.specsByPath[n];if(!s)return;let r=null,a=s.fields?.targetPaths||s.fields?.default;if(a&&(r=Array.isArray(a)?a[0]:a),!r)return;r=String(r).replace(/^<|>$/g,"");let o=new Ji;this._applyMaterial(o,r),t.material=o}_pickBestMaterial(t){for(let e of t){let n=this.shadersByMaterialPath.get(e);if(n)for(let s of n){let r=this._getAttributes(s);if(r["info:id"]==="UsdUVTexture"&&r["inputs:file"])return e}}return t[0]}_applyMaterial(t,e){if(!this.specsByPath[e])return;let s=this.shadersByMaterialPath.get(e);if(s)for(let r of s){let a=this.specsByPath[r];if(!a)continue;let l=this._getAttributes(r)["info:id"]||a.fields["info:id"];l==="UsdPreviewSurface"||l==="ND_UsdPreviewSurface_surfaceshader"?this._applyPreviewSurface(t,r):l==="arnold:openpbr_surface"&&this._applyOpenPBRSurface(t,r)}}_applyTextureOrValue(t,e,n,s,r,a,o,l){let c=e+"."+s,f=this.specsByPath[c];if(f&&f.fields.connectionPaths&&f.fields.connectionPaths.length>0){let u=l===this._getTextureFromOpenPBRConnection?f.fields.connectionPaths:[f.fields.connectionPaths[0]];for(let d of u){let p=l.call(this,d);if(p)return p.colorSpace=a,t[r]=p,!0}}return n[s]!==void 0&&o&&o(n[s]),!1}_applyPreviewSurface(t,e){let n=this._getAttributes(e),s=(u,d,p,g)=>this._applyTextureOrValue(t,e,n,u,d,p,g,this._getTextureFromConnection),r=u=>{let d=e+"."+u;return this.specsByPath[d]};if(s("inputs:diffuseColor","map",pe,u=>{Array.isArray(u)&&u.length>=3&&t.color.setRGB(u[0],u[1],u[2],pe)}),t.map&&t.map.userData.scale){let u=t.map.userData.scale;Array.isArray(u)&&u.length>=3&&t.color.setRGB(u[0],u[1],u[2],pe)}if(s("inputs:emissiveColor","emissiveMap",pe,u=>{Array.isArray(u)&&u.length>=3&&t.emissive.setRGB(u[0],u[1],u[2],pe)}),t.emissiveMap)if(t.emissiveMap.userData.scale){let u=t.emissiveMap.userData.scale;Array.isArray(u)&&u.length>=3&&t.emissive.setRGB(u[0],u[1],u[2],pe)}else t.emissive.set(16777215);if(s("inputs:normal","normalMap",Ye,null),t.normalMap&&t.normalMap.userData.scale){let u=t.normalMap.userData.scale;t.normalScale=new Kt(u[0],u[1])}if(s("inputs:roughness","roughnessMap",Ye,u=>{t.roughness=u})&&(t.roughness=1),s("inputs:metallic","metalnessMap",Ye,u=>{t.metalness=u})&&(t.metalness=1),s("inputs:occlusion","aoMap",Ye,null),n["inputs:ior"]!==void 0&&(t.ior=n["inputs:ior"]),s("inputs:specularColor","specularColorMap",pe,u=>{Array.isArray(u)&&u.length>=3&&t.specularColor.setRGB(u[0],u[1],u[2],pe)}),t.specularColorMap&&t.specularColorMap.userData.scale){let u=t.specularColorMap.userData.scale;Array.isArray(u)&&u.length>=3&&t.specularColor.setRGB(u[0],u[1],u[2],pe)}n["inputs:clearcoat"]!==void 0&&(t.clearcoat=n["inputs:clearcoat"]),n["inputs:clearcoatRoughness"]!==void 0&&(t.clearcoatRoughness=n["inputs:clearcoatRoughness"]);let l=n["inputs:opacityThreshold"]!==void 0?n["inputs:opacityThreshold"]:0;if(r("inputs:opacity")?.fields?.connectionPaths?.length>0)l>0?(t.alphaTest=l,t.transparent=!1):t.transparent=!0;else{let u=n["inputs:opacity"]!==void 0?n["inputs:opacity"]:1;u<1&&(t.transparent=!0,t.opacity=u)}}_applyOpenPBRSurface(t,e){let n=this._getAttributes(e),s=(y,m,_,R)=>this._applyTextureOrValue(t,e,n,y,m,_,R,this._getTextureFromOpenPBRConnection);if(s("inputs:base_color","map",pe,y=>{Array.isArray(y)&&y.length>=3&&t.color.setRGB(y[0],y[1],y[2],pe)}),t.map&&t.map.userData.scale){let y=t.map.userData.scale;Array.isArray(y)&&y.length>=3&&t.color.setRGB(y[0],y[1],y[2],pe)}s("inputs:base_metalness","metalnessMap",Ye,y=>{typeof y=="number"&&(t.metalness=y)}),s("inputs:specular_roughness","roughnessMap",Ye,y=>{typeof y=="number"&&(t.roughness=y)});let r=s("inputs:emission_color","emissiveMap",pe,y=>{Array.isArray(y)&&y.length>=3&&t.emissive.setRGB(y[0],y[1],y[2],pe)}),a=n["inputs:emission_luminance"];a!==void 0&&a>0&&(r?t.emissiveIntensity=a:t.emissive.multiplyScalar(a));let o=n["inputs:transmission_weight"];if(o!==void 0&&o>0){t.transmission=o;let y=n["inputs:transmission_depth"];y!==void 0&&(t.thickness=y);let m=n["inputs:transmission_color"];m!==void 0&&Array.isArray(m)&&(t.attenuationColor.setRGB(m[0],m[1],m[2]),t.attenuationDistance=y||1)}let l=n["inputs:geometry_opacity"];l!==void 0&&l<1&&(t.opacity=l,t.transparent=!0);let c=n["inputs:specular_ior"];c!==void 0&&(t.ior=c);let f=n["inputs:coat_weight"];if(f!==void 0&&f>0){t.clearcoat=f;let y=n["inputs:coat_roughness"];y!==void 0&&(t.clearcoatRoughness=y)}let u=n["inputs:thin_film_weight"];if(u!==void 0&&u>0){t.iridescence=u;let y=n["inputs:thin_film_ior"];y!==void 0&&(t.iridescenceIOR=y);let m=n["inputs:thin_film_thickness"];if(m!==void 0){let _=m*1e3;t.iridescenceThicknessRange=[_,_]}}let d=n["inputs:specular_weight"];d!==void 0&&(t.specularIntensity=d);let p=n["inputs:specular_color"];p!==void 0&&Array.isArray(p)&&t.specularColor.setRGB(p[0],p[1],p[2]);let g=n["inputs:specular_roughness_anisotropy"];g!==void 0&&g>0&&(t.anisotropy=g),s("inputs:geometry_normal","normalMap",Ye,null)}_getTextureFromOpenPBRConnection(t){let e=t.replace(/<|>/g,""),n=e.split(".")[0],s=this.specsByPath[n];if(!s)return null;let r=this._getAttributes(n),a=r["info:id"]||s.fields["info:id"];if(s.fields.typeName==="NodeGraph"){let c=e.split(".")[1],f=n+"."+c,u=this.specsByPath[f];return u?.fields?.connectionPaths?.length>0?this._getTextureFromOpenPBRConnection(u.fields.connectionPaths[0]):null}if(a==="arnold:image"){let c=r["inputs:filename"];return c?this._loadTextureFromPath(c):null}if(a&&a.startsWith("ND_image_")){let c=r["inputs:file"];return c?this._loadTextureFromPath(c):null}if(a==="MayaND_fileTexture_color4"){let c=n+".inputs:inColor",f=this.specsByPath[c];return f?.fields?.connectionPaths?.length>0?this._getTextureFromOpenPBRConnection(f.fields.connectionPaths[0]):null}if(a&&a.startsWith("ND_convert_")){let c=n+".inputs:in",f=this.specsByPath[c];return f?.fields?.connectionPaths?.length>0?this._getTextureFromOpenPBRConnection(f.fields.connectionPaths[0]):null}if(a==="arnold:bump2d"){let c=n+".inputs:bump_map",f=this.specsByPath[c];return f?.fields?.connectionPaths?.length>0?this._getTextureFromOpenPBRConnection(f.fields.connectionPaths[0]):null}if(a==="arnold:color_correct"){let c=n+".inputs:input",f=this.specsByPath[c];return f?.fields?.connectionPaths?.length>0?this._getTextureFromOpenPBRConnection(f.fields.connectionPaths[0]):null}let l=n.substring(0,n.lastIndexOf("/"));if(l){let c=this.specsByPath[l];if(c){let f=this._getAttributes(l);if((f["info:id"]||c.fields["info:id"])==="arnold:image"){let d=f["inputs:filename"];if(d)return this._loadTextureFromPath(d)}}}return null}_loadTextureFromPath(t){if(!t)return null;if(this.textureCache[t])return this.textureCache[t];let e=this._loadTexture(t,null,null);return e&&(this.textureCache[t]=e),e}_getTextureFromConnection(t){let e=t.split(".")[0],n=this.specsByPath[e];if(!n)return null;let s=this._getAttributes(e);if((s["info:id"]||n.fields["info:id"])!=="UsdUVTexture")return null;let a=s["inputs:file"];if(!a)return null;let o=null,l=0,c=e+".inputs:st",f=this.specsByPath[c];if(f?.fields?.connectionPaths?.length>0){let m=f.fields.connectionPaths[0].replace(/<|>/g,"").split(".")[0],_=this.specsByPath[m];if(_){let R=this._getAttributes(m),w=R["info:id"]||_.fields["info:id"];if(w==="UsdTransform2d"){o=R;let v=m+".inputs:in",E=this.specsByPath[v];if(E?.fields?.connectionPaths?.length>0){let D=E.fields.connectionPaths[0].replace(/<|>/g,"").split(".")[0],T=this._getAttributes(D)["inputs:varname"];T==="st1"?l=1:T==="st2"&&(l=2)}}else if(w==="UsdPrimvarReader_float2"){let v=R["inputs:varname"];v==="st1"?l=1:v==="st2"&&(l=2)}}}let u=s["inputs:scale"],d=s["inputs:bias"],p=a+":uv"+l;if(u&&(p+=":s"+u.join(",")),d&&(p+=":b"+d.join(",")),this.textureCache[p])return this.textureCache[p];let g=this._loadTexture(a,s,o);return g&&(u&&(g.userData.scale=u),d&&(g.userData.bias=d),l!==0&&(g.channel=l),this.textureCache[p]=g),g}_applyTextureTransforms(t,e){if(!e)return;let n=e["inputs:scale"];n&&Array.isArray(n)&&n.length>=2&&t.repeat.set(n[0],n[1]);let s=e["inputs:translation"];s&&Array.isArray(s)&&s.length>=2&&t.offset.set(s[0],s[1]);let r=e["inputs:rotation"];typeof r=="number"&&(t.rotation=r*Math.PI/180)}_loadTexture(t,e,n){let s=t;s.startsWith("@")&&(s=s.slice(1)),s.endsWith("@")&&(s=s.slice(0,-1));let r=this._resolveFilePath(s),a=this.assets[r];if(a||(a=this.assets[s]),!a){let o=s.split("/").pop();for(let l in this.assets)if(l.endsWith(o)||l.endsWith("/"+o))return this._createTextureFromData(this.assets[l],e,n);if(this.basePath)return this._createTextureFromData(r,e,n);if(this.manager){let l=this.manager.resolveURL(o);if(l!==o)return this._createTextureFromData(l,e,n)}return console.warn("USDLoader: Texture not found:",s),null}return this._createTextureFromData(a,e,n)}_createTextureFromData(t,e,n){if(!t)return null;let s=this,r=new Qe,a;if(typeof t=="string")a=t;else if(t instanceof Uint8Array||t instanceof ArrayBuffer){let l=new Blob([t]);a=URL.createObjectURL(l)}else return null;let o=new Image;return this.texturePromises.push(new Promise(l=>{o.onload=function(){r.image=o,e&&(r.wrapS=s._getWrapMode(e["inputs:wrapS"]),r.wrapT=s._getWrapMode(e["inputs:wrapT"])),s._applyTextureTransforms(r,n),r.needsUpdate=!0,typeof t!="string"&&URL.revokeObjectURL(a),l()},o.onerror=function(){console.warn("USDLoader: Failed to load texture:",a),typeof t!="string"&&URL.revokeObjectURL(a),l()}})),o.src=a,r}_getWrapMode(t){return t==="repeat"?Wi:t==="mirror"?As:t==="clamp"?an:Wi}_buildSkeleton(t){let e=this._getAttributes(t),n=e.joints;if(!n||n.length===0)return null;let s=e.bindTransforms,r=e.restTransforms,a=this._flattenMatrixArray(s,n.length),o=this._flattenMatrixArray(r,n.length),l=[],c={},f=[];for(let g=0;g<n.length;g++){let y=n[g],m=y.split("/").pop(),_=new Is;if(_.name=m,l.push(_),c[y]={bone:_,index:g},a&&a.length>=(g+1)*16){let R=new se,w=a.slice(g*16,(g+1)*16);R.set(w[0],w[4],w[8],w[12],w[1],w[5],w[9],w[13],w[2],w[6],w[10],w[14],w[3],w[7],w[11],w[15]);let v=R.clone().invert();f.push(v)}else f.push(new se)}for(let g=0;g<n.length;g++){let m=n[g].split("/");if(m.length>1){let _=m.slice(0,-1).join("/"),R=c[_];R&&R.bone.add(l[g])}}if(o&&o.length>=n.length*16)for(let g=0;g<n.length;g++){let y=new se,m=o.slice(g*16,(g+1)*16);y.set(m[0],m[4],m[8],m[12],m[1],m[5],m[9],m[13],m[2],m[6],m[10],m[14],m[3],m[7],m[11],m[15]),y.decompose(l[g].position,l[g].quaternion,l[g].scale)}let u=l.filter(g=>!g.parent||!g.parent.isBone),d=this.specsByPath[t+".skel:animationSource"],p=null;return d&&d.fields.targetPaths&&d.fields.targetPaths.length>0&&(p=d.fields.targetPaths[0]),{skeleton:new xr(l,f),joints:n,rootBones:u,animationPath:p,path:t}}_bindSkeletons(){for(let t of this.skinnedMeshes){let{mesh:e,skeletonPath:n,localJoints:s,geomBindTransform:r}=t,a=null;if(n&&this.skeletons[n]&&(a=this.skeletons[n]),!a){for(let u in this.skeletons)if(n&&(n.includes(u)||u.includes(n))){a=this.skeletons[u];break}}if(!a){let u=Object.keys(this.skeletons);u.length>0&&(a=this.skeletons[u[0]])}if(!a){console.warn("USDComposer: No skeleton found for skinned mesh",e.name);continue}let{skeleton:o,rootBones:l,joints:c}=a;if(s&&s.length>0){let u=e.geometry.attributes.skinIndex;if(u){let d=[];for(let g=0;g<s.length;g++){let y=s[g],m=c.indexOf(y);d[g]=m>=0?m:0}let p=u.array;for(let g=0;g<p.length;g++){let y=p[g];y<d.length&&(p[g]=d[y])}}}for(let u of l)e.add(u);let f=new se;if(r&&r.length===16){let u=r;f.set(u[0],u[4],u[8],u[12],u[1],u[5],u[9],u[13],u[2],u[6],u[10],u[14],u[3],u[7],u[11],u[15])}e.bind(o,f)}}_buildAnimations(){let t=[];for(let n in this.specsByPath){let s=this.specsByPath[n];if(s.specType!==is.Prim||s.fields.typeName!=="SkelAnimation")continue;let r=this._buildAnimationClip(n);r&&t.push(r)}let e=this._buildTransformAnimations();return e.length>0&&t.push(new Os("TransformAnimation",-1,e)),t}_buildTransformAnimations(){let t=[];for(let e in this.specsByPath){let n=this.specsByPath[e];if(n.specType!==is.Prim)continue;let s=n.fields?.typeName;if(s!=="Xform"&&s!=="Scope"&&s!=="Mesh")continue;let r=e.split("/").pop(),a=e+".xformOp:orient",o=this.specsByPath[a];if(o?.fields?.timeSamples){let{times:y,values:m}=o.fields.timeSamples,_=[],R=[];for(let w=0;w<y.length;w++){_.push(y[w]/this.fps);let v=m[w];R.push(v[0],v[1],v[2],v[3])}_.length>0&&t.push(new In(r+".quaternion",new Float32Array(_),new Float32Array(R)))}let l=e+".xformOp:rotateXYZ",c=this.specsByPath[l];if(c?.fields?.timeSamples){let{times:y,values:m}=c.fields.timeSamples,_=[],R=[],w=new gn,v=new We;for(let E=0;E<y.length;E++){_.push(y[E]/this.fps);let C=m[E];w.set(C[0]*Math.PI/180,C[1]*Math.PI/180,C[2]*Math.PI/180,"ZYX"),v.setFromEuler(w),R.push(v.x,v.y,v.z,v.w)}_.length>0&&t.push(new In(r+".quaternion",new Float32Array(_),new Float32Array(R)))}let f=e+".xformOp:translate",u=this.specsByPath[f];if(u?.fields?.timeSamples){let{times:y,values:m}=u.fields.timeSamples,_=[],R=[];for(let w=0;w<y.length;w++){_.push(y[w]/this.fps);let v=m[w];R.push(v[0],v[1],v[2])}_.length>0&&t.push(new wn(r+".position",new Float32Array(_),new Float32Array(R)))}let d=e+".xformOp:scale",p=this.specsByPath[d];if(p?.fields?.timeSamples){let{times:y,values:m}=p.fields.timeSamples,_=[],R=[];for(let w=0;w<y.length;w++){_.push(y[w]/this.fps);let v=m[w];R.push(v[0],v[1],v[2])}_.length>0&&t.push(new wn(r+".scale",new Float32Array(_),new Float32Array(R)))}let g=n.fields?.properties||[];for(let y of g){if(!y.startsWith("xformOp:transform"))continue;let m=e+"."+y,_=this.specsByPath[m];if(!_?.fields?.timeSamples)continue;let{times:R,values:w}=_.fields.timeSamples,v=[],E=[],C=[],D=[],S=[],T=[],L=new se,N=new H,F=new We,Y=new H;for(let J=0;J<R.length;J++){let O=w[J];if(!O||O.length<16)continue;let K=R[J]/this.fps;L.set(O[0],O[4],O[8],O[12],O[1],O[5],O[9],O[13],O[2],O[6],O[10],O[14],O[3],O[7],O[11],O[15]),L.decompose(N,F,Y),v.push(K),E.push(N.x,N.y,N.z),C.push(K),D.push(F.x,F.y,F.z,F.w),S.push(K),T.push(Y.x,Y.y,Y.z)}v.length>0&&(t.push(new wn(r+".position",new Float32Array(v),new Float32Array(E))),t.push(new In(r+".quaternion",new Float32Array(C),new Float32Array(D))),t.push(new wn(r+".scale",new Float32Array(S),new Float32Array(T))));break}}return t}_buildAnimationClip(t){let n=this._getAttributes(t).joints;if(!n||n.length===0)return null;let s=[],r=this._getTimeSampledAttribute(t,"rotations");if(r&&r.times&&r.values){let{times:c,values:f}=r;for(let u=0;u<n.length;u++){let d=n[u].split("/").pop(),p=[],g=[];for(let y=0;y<c.length;y++){let m=f[y];if(!m||m.length<(u+1)*4)continue;p.push(c[y]/this.fps);let _=m[u*4+0],R=m[u*4+1],w=m[u*4+2],v=m[u*4+3];g.push(_,R,w,v)}p.length>0&&s.push(new In(d+".quaternion",new Float32Array(p),new Float32Array(g)))}}let a=this._getTimeSampledAttribute(t,"translations");if(a&&a.times&&a.values){let{times:c,values:f}=a;for(let u=0;u<n.length;u++){let d=n[u].split("/").pop(),p=[],g=[];for(let y=0;y<c.length;y++){let m=f[y];!m||m.length<(u+1)*3||(p.push(c[y]/this.fps),g.push(m[u*3+0],m[u*3+1],m[u*3+2]))}p.length>0&&s.push(new wn(d+".position",new Float32Array(p),new Float32Array(g)))}}let o=this._getTimeSampledAttribute(t,"scales");if(o&&o.times&&o.values){let{times:c,values:f}=o;for(let u=0;u<n.length;u++){let d=n[u].split("/").pop(),p=[],g=[];for(let y=0;y<c.length;y++){let m=f[y];!m||m.length<(u+1)*3||(p.push(c[y]/this.fps),g.push(m[u*3+0],m[u*3+1],m[u*3+2]))}p.length>0&&s.push(new wn(d+".scale",new Float32Array(p),new Float32Array(g)))}}if(s.length===0)return null;let l=t.split("/").pop();return new Os(l,-1,s)}_getTimeSampledAttribute(t,e){let n=t+"."+e,s=this.specsByPath[n];if(s&&s.fields.timeSamples){let r=s.fields.timeSamples;if(r.times&&r.values)return r}return null}_flattenMatrixArray(t,e){if(!t||t.length===0)return null;if(typeof t[0]=="number")return t;let n=[];for(let s=0;s<e;s++)for(let r=0;r<4;r++){let a=t[s*4+r];a&&a.length===4?n.push(a[0],a[1],a[2],a[3]):n.push(r===0?1:0,r===1?1:0,r===2?1:0,r===3?1:0)}return n}};var uh=class extends Ti{constructor(t){super(t)}load(t,e,n,s){let r=this,a=r.path===""?ji.extractUrlBase(t):r.path,o=new Bs(r.manager);o.setPath(r.path),o.setResponseType("arraybuffer"),o.setRequestHeader(r.requestHeader),o.setWithCredentials(r.withCredentials),o.load(t,function(l){try{r.parse(l,a,e,s)}catch(c){s?s(c):console.error(c),r.manager.itemError(t)}},n,s)}parse(t,e="",n,s){let r=new cl,a=new hl,o=new TextDecoder;function l(w){return w instanceof ArrayBuffer?w:w.byteOffset===0&&w.byteLength===w.buffer.byteLength?w.buffer:w.buffer.slice(w.byteOffset,w.byteOffset+w.byteLength)}function c(w){let v=w.lastIndexOf(".");return v<0||w.lastIndexOf("/")>v?"":w.slice(v+1).toLowerCase()}function f(w){let v={};for(let E in w){let C=w[E],D=c(E);if(D==="png"||D==="jpg"||D==="jpeg"||D==="avif"){v[E]=C;continue}D!=="usd"&&D!=="usda"&&D!=="usdc"||(u(C)?v[E]=a.parseData(l(C)):v[E]=r.parseData(o.decode(C)))}return v}function u(w){let v=new Uint8Array([80,88,82,45,85,83,68,67]),E=w instanceof Uint8Array?w:new Uint8Array(w);if(E.byteLength<v.length)return!1;for(let C=0;C<v.length;C++)if(E[C]!==v[C])return!1;return!0}function d(w){let v=Object.keys(w);if(v.length<1)return{file:void 0,filename:"",basePath:""};let E=v[0],C=c(E),D=!1,S=E.lastIndexOf("/"),T=S>=0?E.slice(0,S):"";if(C==="usda")return{file:w[E],filename:E,basePath:T};if(C==="usdc")D=!0;else if(C==="usd")if(u(w[E]))D=!0;else return{file:w[E],filename:E,basePath:T};return D?{file:w[E],filename:E,basePath:T}:{file:void 0,filename:"",basePath:""}}let p=this,g=(w,v)=>(n&&Promise.all(w.texturePromises).then(()=>n(v)).catch(E=>s?s(E):console.error(E)),v);if(typeof t=="string"){let w=new ss(p.manager),v=r.parseData(t);return g(w,w.compose(v,{},{},e))}if(u(t)){let w=new ss(p.manager),v=a.parseData(l(t));return g(w,w.compose(v,{},{},e))}let y=new Uint8Array(t);if(y[0]===80&&y[1]===75){let w=oh(y),v=f(w),{file:E,filename:C,basePath:D}=d(w);if(!E)throw new Error("THREE.USDLoader: Invalid USDZ package. The first ZIP entry must be a USD layer (.usd/.usda/.usdc).");let S=new ss(p.manager),T=v[C];if(!T)throw new Error('THREE.USDLoader: Failed to parse root layer "'+C+'".');return g(S,S.compose(T,v,{},D))}let m=new ss(p.manager),_=o.decode(y),R=r.parseData(_);return g(m,m.compose(R,{},{},e))}};var fh=class extends Dr{constructor(t){super(t),this.type=en,this.outputFormat=Le,this.part=0}parse(t){let T=Math.pow(2.7182818,2.2),L=null;function N(h,x){let M=0;for(let P=0;P<65536;++P)(P==0||h[P>>3]&1<<(P&7))&&(x[M++]=P);let A=M-1;for(;M<65536;)x[M++]=0;return A}function F(h){for(let x=0;x<16384;x++)h[x]={},h[x].len=0,h[x].lit=0,h[x].p=null}let Y={l:0,c:0,lc:0};function J(h,x,M,A,P){for(;M<h;)x=x<<8|wt(A,P),M+=8;M-=h,Y.l=x>>M&(1<<h)-1,Y.c=x,Y.lc=M}let O=new Array(59);function K(h){for(let M=0;M<=58;++M)O[M]=0;for(let M=0;M<65537;++M)O[h[M]]+=1;let x=0;for(let M=58;M>0;--M){let A=x+O[M]>>1;O[M]=x,x=A}for(let M=0;M<65537;++M){let A=h[M];A>0&&(h[M]=A|O[A]++<<6)}}function Z(h,x,M,A,P,k){let I=x,z=0,G=0;for(;A<=P;A++){if(I.value-x.value>M)return!1;J(6,z,G,h,I);let W=Y.l;if(z=Y.c,G=Y.lc,k[A]=W,W==63){if(I.value-x.value>M)throw new Error("THREE.EXRLoader: Something wrong with hufUnpackEncTable");J(8,z,G,h,I);let $=Y.l+6;if(z=Y.c,G=Y.lc,A+$>P+1)throw new Error("THREE.EXRLoader: Something wrong with hufUnpackEncTable");for(;$--;)k[A++]=0;A--}else if(W>=59){let $=W-59+2;if(A+$>P+1)throw new Error("THREE.EXRLoader: Something wrong with hufUnpackEncTable");for(;$--;)k[A++]=0;A--}}K(k)}function st(h){return h&63}function lt(h){return h>>6}function St(h,x,M,A){for(;x<=M;x++){let P=lt(h[x]),k=st(h[x]);if(P>>k)throw new Error("THREE.EXRLoader: Invalid table entry");if(k>14){let I=A[P>>k-14];if(I.len)throw new Error("THREE.EXRLoader: Invalid table entry");if(I.lit++,I.p){let z=I.p;I.p=new Array(I.lit);for(let G=0;G<I.lit-1;++G)I.p[G]=z[G]}else I.p=new Array(1);I.p[I.lit-1]=x}else if(k){let I=0;for(let z=1<<14-k;z>0;z--){let G=A[(P<<14-k)+I];if(G.len||G.p)throw new Error("THREE.EXRLoader: Invalid table entry");G.len=k,G.lit=x,I++}}}return!0}let mt={c:0,lc:0};function vt(h,x,M,A){h=h<<8|wt(M,A),x+=8,mt.c=h,mt.lc=x}let qt={c:0,lc:0};function Qt(h,x,M,A,P,k,I,z,G){if(h==x){A<8&&(vt(M,A,P,k),M=mt.c,A=mt.lc),A-=8;let W=M>>A;if(W=new Uint8Array([W])[0],z.value+W>G)return!1;let $=I[z.value-1];for(;W-- >0;)I[z.value++]=$}else if(z.value<G)I[z.value++]=h;else return!1;qt.c=M,qt.lc=A}function kt(h){return h&65535}function tt(h){let x=kt(h);return x>32767?x-65536:x}let ot={a:0,b:0};function ht(h,x){let M=tt(h),P=tt(x),k=M+(P&1)+(P>>1),I=k,z=k-P;ot.a=I,ot.b=z}function gt(h,x){let M=kt(h),A=kt(x),P=M-(A>>1)&65535,k=A+P-32768&65535;ot.a=k,ot.b=P}function Nt(h,x,M,A,P,k,I){let z=I<16384,G=M>P?P:M,W=1,$,nt;for(;W<=G;)W<<=1;for(W>>=1,$=W,W>>=1;W>=1;){nt=0;let q=nt+k*(P-$),ct=k*W,_t=k*$,ft=A*W,pt=A*$,Pt,dt,Xt,Ot;for(;nt<=q;nt+=_t){let It=nt,bt=nt+A*(M-$);for(;It<=bt;It+=pt){let Bt=It+ft,he=It+ct,Ht=he+ft;z?(ht(h[It+x],h[he+x]),Pt=ot.a,Xt=ot.b,ht(h[Bt+x],h[Ht+x]),dt=ot.a,Ot=ot.b,ht(Pt,dt),h[It+x]=ot.a,h[Bt+x]=ot.b,ht(Xt,Ot),h[he+x]=ot.a,h[Ht+x]=ot.b):(gt(h[It+x],h[he+x]),Pt=ot.a,Xt=ot.b,gt(h[Bt+x],h[Ht+x]),dt=ot.a,Ot=ot.b,gt(Pt,dt),h[It+x]=ot.a,h[Bt+x]=ot.b,gt(Xt,Ot),h[he+x]=ot.a,h[Ht+x]=ot.b)}if(M&W){let Bt=It+ct;z?ht(h[It+x],h[Bt+x]):gt(h[It+x],h[Bt+x]),Pt=ot.a,h[Bt+x]=ot.b,h[It+x]=Pt}}if(P&W){let It=nt,bt=nt+A*(M-$);for(;It<=bt;It+=pt){let Bt=It+ft;z?ht(h[It+x],h[Bt+x]):gt(h[It+x],h[Bt+x]),Pt=ot.a,h[Bt+x]=ot.b,h[It+x]=Pt}}$=W,W>>=1}return nt}function Lt(h,x,M,A,P,k,I,z,G){let W=0,$=0,nt=I,q=Math.trunc(A.value+(P+7)/8);for(;A.value<q;)for(vt(W,$,M,A),W=mt.c,$=mt.lc;$>=14;){let _t=W>>$-14&16383,ft=x[_t];if(ft.len)$-=ft.len,Qt(ft.lit,k,W,$,M,A,z,G,nt),W=qt.c,$=qt.lc;else{if(!ft.p)throw new Error("THREE.EXRLoader: hufDecode issues");let pt;for(pt=0;pt<ft.lit;pt++){let Pt=st(h[ft.p[pt]]);for(;$<Pt&&A.value<q;)vt(W,$,M,A),W=mt.c,$=mt.lc;if($>=Pt&&lt(h[ft.p[pt]])==(W>>$-Pt&(1<<Pt)-1)){$-=Pt,Qt(ft.p[pt],k,W,$,M,A,z,G,nt),W=qt.c,$=qt.lc;break}}if(pt==ft.lit)throw new Error("THREE.EXRLoader: hufDecode issues")}}let ct=8-P&7;for(W>>=ct,$-=ct;$>0;){let _t=x[W<<14-$&16383];if(_t.len)$-=_t.len,Qt(_t.lit,k,W,$,M,A,z,G,nt),W=qt.c,$=qt.lc;else throw new Error("THREE.EXRLoader: hufDecode issues")}return!0}function re(h,x,M,A,P,k){let I={value:0},z=M.value,G=xt(x,M),W=xt(x,M);M.value+=4;let $=xt(x,M);if(M.value+=4,G<0||G>=65537||W<0||W>=65537)throw new Error("THREE.EXRLoader: Something wrong with HUF_ENCSIZE");let nt=new Array(65537),q=new Array(16384);F(q);let ct=A-(M.value-z);if(Z(h,M,ct,G,W,nt),$>8*(A-(M.value-z)))throw new Error("THREE.EXRLoader: Something wrong with hufUncompress");St(nt,G,W,q),Lt(nt,q,h,M,$,W,k,P,I)}function Dt(h,x,M){for(let A=0;A<M;++A)x[A]=h[x[A]]}function $t(h){for(let x=1;x<h.length;x++){let M=h[x-1]+h[x]-128;h[x]=M}}function Zt(h,x){let M=0,A=Math.floor((h.length+1)/2),P=0,k=h.length-1;for(;!(P>k||(x[P++]=h[M++],P>k));)x[P++]=h[A++]}function le(h){let x=h.byteLength,M=new Array,A=0,P=new DataView(h);for(;x>0;){let k=P.getInt8(A++);if(k<0){let I=-k;x-=I+1;for(let z=0;z<I;z++)M.push(P.getUint8(A++))}else{let I=k;x-=2;let z=P.getUint8(A++);for(let G=0;G<I+1;G++)M.push(z)}}return M}function Ce(h,x,M,A,P,k){let I=new DataView(k.buffer),z=M[h.idx[0]].width,G=M[h.idx[0]].height,W=3,$=Math.floor(z/8),nt=Math.ceil(z/8),q=Math.ceil(G/8),ct=z-(nt-1)*8,_t=G-(q-1)*8,ft={value:0},pt=new Array(W),Pt=new Array(W),dt=new Array(W),Xt=new Array(W),Ot=new Array(W);for(let bt=0;bt<W;++bt)Ot[bt]=x[h.idx[bt]],pt[bt]=bt<1?0:pt[bt-1]+nt*q,Pt[bt]=new Float32Array(64),dt[bt]=new Uint16Array(64),Xt[bt]=new Uint16Array(nt*64);for(let bt=0;bt<q;++bt){let Bt=8;bt==q-1&&(Bt=_t);let he=8;for(let zt=0;zt<nt;++zt){zt==nt-1&&(he=ct);for(let ee=0;ee<W;++ee)dt[ee].fill(0),dt[ee][0]=P[pt[ee]++],De(ft,A,dt[ee]),Ne(dt[ee],Pt[ee]),Se(Pt[ee]);W==3&&Re(Pt);for(let ee=0;ee<W;++ee)V(Pt[ee],Xt[ee],zt*64)}let Ht=0;for(let zt=0;zt<W;++zt){let ee=M[h.idx[zt]].type;for(let te=8*bt;te<8*bt+Bt;++te){Ht=Ot[zt][te];for(let Pe=0;Pe<$;++Pe){let fe=Pe*64+(te&7)*8;I.setUint16(Ht+0*ee,Xt[zt][fe+0],!0),I.setUint16(Ht+2*ee,Xt[zt][fe+1],!0),I.setUint16(Ht+4*ee,Xt[zt][fe+2],!0),I.setUint16(Ht+6*ee,Xt[zt][fe+3],!0),I.setUint16(Ht+8*ee,Xt[zt][fe+4],!0),I.setUint16(Ht+10*ee,Xt[zt][fe+5],!0),I.setUint16(Ht+12*ee,Xt[zt][fe+6],!0),I.setUint16(Ht+14*ee,Xt[zt][fe+7],!0),Ht+=16*ee}}if($!=nt)for(let te=8*bt;te<8*bt+Bt;++te){let Pe=Ot[zt][te]+8*$*2*ee,fe=$*64+(te&7)*8;for(let un=0;un<he;++un)I.setUint16(Pe+un*2*ee,Xt[zt][fe+un],!0)}}}let It=new Uint16Array(z);I=new DataView(k.buffer);for(let bt=0;bt<W;++bt){M[h.idx[bt]].decoded=!0;let Bt=M[h.idx[bt]].type;if(M[bt].type==2)for(let he=0;he<G;++he){let Ht=Ot[bt][he];for(let zt=0;zt<z;++zt)It[zt]=I.getUint16(Ht+zt*2*Bt,!0);for(let zt=0;zt<z;++zt)I.setFloat32(Ht+zt*2*Bt,Q(It[zt]),!0)}}}function Ie(h,x,M,A,P,k){let I=new DataView(k.buffer),z=M[h],G=z.width,W=z.height,$=Math.ceil(G/8),nt=Math.ceil(W/8),q=Math.floor(G/8),ct=G-($-1)*8,_t=W-(nt-1)*8,ft={value:0},pt=0,Pt=new Float32Array(64),dt=new Uint16Array(64),Xt=new Uint16Array($*64);for(let Ot=0;Ot<nt;++Ot){let It=8;Ot==nt-1&&(It=_t);for(let bt=0;bt<$;++bt)dt.fill(0),dt[0]=P[pt++],De(ft,A,dt),Ne(dt,Pt),Se(Pt),V(Pt,Xt,bt*64);for(let bt=8*Ot;bt<8*Ot+It;++bt){let Bt=x[h][bt];for(let he=0;he<q;++he){let Ht=he*64+(bt&7)*8;for(let zt=0;zt<8;++zt)I.setUint16(Bt+zt*2*z.type,Xt[Ht+zt],!0);Bt+=16*z.type}if($!=q){let he=q*64+(bt&7)*8;for(let Ht=0;Ht<ct;++Ht)I.setUint16(Bt+Ht*2*z.type,Xt[he+Ht],!0)}}}z.decoded=!0}function De(h,x,M){let A,P=1;for(;P<64;)A=x[h.value],A==65280?P=64:A>>8==255?P+=A&255:(M[P]=A,P++),h.value++}function Ne(h,x){x[0]=Q(h[0]),x[1]=Q(h[1]),x[2]=Q(h[5]),x[3]=Q(h[6]),x[4]=Q(h[14]),x[5]=Q(h[15]),x[6]=Q(h[27]),x[7]=Q(h[28]),x[8]=Q(h[2]),x[9]=Q(h[4]),x[10]=Q(h[7]),x[11]=Q(h[13]),x[12]=Q(h[16]),x[13]=Q(h[26]),x[14]=Q(h[29]),x[15]=Q(h[42]),x[16]=Q(h[3]),x[17]=Q(h[8]),x[18]=Q(h[12]),x[19]=Q(h[17]),x[20]=Q(h[25]),x[21]=Q(h[30]),x[22]=Q(h[41]),x[23]=Q(h[43]),x[24]=Q(h[9]),x[25]=Q(h[11]),x[26]=Q(h[18]),x[27]=Q(h[24]),x[28]=Q(h[31]),x[29]=Q(h[40]),x[30]=Q(h[44]),x[31]=Q(h[53]),x[32]=Q(h[10]),x[33]=Q(h[19]),x[34]=Q(h[23]),x[35]=Q(h[32]),x[36]=Q(h[39]),x[37]=Q(h[45]),x[38]=Q(h[52]),x[39]=Q(h[54]),x[40]=Q(h[20]),x[41]=Q(h[22]),x[42]=Q(h[33]),x[43]=Q(h[38]),x[44]=Q(h[46]),x[45]=Q(h[51]),x[46]=Q(h[55]),x[47]=Q(h[60]),x[48]=Q(h[21]),x[49]=Q(h[34]),x[50]=Q(h[37]),x[51]=Q(h[47]),x[52]=Q(h[50]),x[53]=Q(h[56]),x[54]=Q(h[59]),x[55]=Q(h[61]),x[56]=Q(h[35]),x[57]=Q(h[36]),x[58]=Q(h[48]),x[59]=Q(h[49]),x[60]=Q(h[57]),x[61]=Q(h[58]),x[62]=Q(h[62]),x[63]=Q(h[63])}function Se(h){let x=.5*Math.cos(.7853975),M=.5*Math.cos(3.14159/16),A=.5*Math.cos(3.14159/8),P=.5*Math.cos(3*3.14159/16),k=.5*Math.cos(5*3.14159/16),I=.5*Math.cos(3*3.14159/8),z=.5*Math.cos(7*3.14159/16),G=new Array(4),W=new Array(4),$=new Array(4),nt=new Array(4);for(let q=0;q<8;++q){let ct=q*8;G[0]=A*h[ct+2],G[1]=I*h[ct+2],G[2]=A*h[ct+6],G[3]=I*h[ct+6],W[0]=M*h[ct+1]+P*h[ct+3]+k*h[ct+5]+z*h[ct+7],W[1]=P*h[ct+1]-z*h[ct+3]-M*h[ct+5]-k*h[ct+7],W[2]=k*h[ct+1]-M*h[ct+3]+z*h[ct+5]+P*h[ct+7],W[3]=z*h[ct+1]-k*h[ct+3]+P*h[ct+5]-M*h[ct+7],$[0]=x*(h[ct+0]+h[ct+4]),$[3]=x*(h[ct+0]-h[ct+4]),$[1]=G[0]+G[3],$[2]=G[1]-G[2],nt[0]=$[0]+$[1],nt[1]=$[3]+$[2],nt[2]=$[3]-$[2],nt[3]=$[0]-$[1],h[ct+0]=nt[0]+W[0],h[ct+1]=nt[1]+W[1],h[ct+2]=nt[2]+W[2],h[ct+3]=nt[3]+W[3],h[ct+4]=nt[3]-W[3],h[ct+5]=nt[2]-W[2],h[ct+6]=nt[1]-W[1],h[ct+7]=nt[0]-W[0]}for(let q=0;q<8;++q)G[0]=A*h[16+q],G[1]=I*h[16+q],G[2]=A*h[48+q],G[3]=I*h[48+q],W[0]=M*h[8+q]+P*h[24+q]+k*h[40+q]+z*h[56+q],W[1]=P*h[8+q]-z*h[24+q]-M*h[40+q]-k*h[56+q],W[2]=k*h[8+q]-M*h[24+q]+z*h[40+q]+P*h[56+q],W[3]=z*h[8+q]-k*h[24+q]+P*h[40+q]-M*h[56+q],$[0]=x*(h[q]+h[32+q]),$[3]=x*(h[q]-h[32+q]),$[1]=G[0]+G[3],$[2]=G[1]-G[2],nt[0]=$[0]+$[1],nt[1]=$[3]+$[2],nt[2]=$[3]-$[2],nt[3]=$[0]-$[1],h[0+q]=nt[0]+W[0],h[8+q]=nt[1]+W[1],h[16+q]=nt[2]+W[2],h[24+q]=nt[3]+W[3],h[32+q]=nt[3]-W[3],h[40+q]=nt[2]-W[2],h[48+q]=nt[1]-W[1],h[56+q]=nt[0]-W[0]}function Re(h){for(let x=0;x<64;++x){let M=h[0][x],A=h[1][x],P=h[2][x];h[0][x]=M+1.5747*P,h[1][x]=M-.1873*A-.4682*P,h[2][x]=M+1.8556*A}}function V(h,x,M){for(let A=0;A<64;++A)x[M+A]=Pn.toHalfFloat(Ke(h[A]))}function Ke(h){return h<=1?Math.sign(h)*Math.pow(Math.abs(h),2.2):Math.sign(h)*Math.pow(T,Math.abs(h)-1)}function ue(h){return new DataView(h.array.buffer,h.offset.value,h.size)}function U(h){let x=h.viewer.buffer.slice(h.offset.value,h.offset.value+h.size),M=new Uint8Array(le(x)),A=new Uint8Array(M.length);return $t(M),Zt(M,A),new DataView(A.buffer)}function b(h){let x=h.array.slice(h.offset.value,h.offset.value+h.size),M=Ys(x),A=new Uint8Array(M.length);return $t(M),Zt(M,A),new DataView(A.buffer)}function X(h){let x=h.viewer,M={value:h.offset.value},A=new Uint16Array(h.columns*h.lines*(h.inputChannels.length*h.type)),P=new Uint8Array(8192),k=0,I=new Array(h.inputChannels.length);for(let _t=0,ft=h.inputChannels.length;_t<ft;_t++)I[_t]={},I[_t].start=k,I[_t].end=I[_t].start,I[_t].nx=h.columns,I[_t].ny=h.lines,I[_t].size=h.type,k+=I[_t].nx*I[_t].ny*I[_t].size;let z=rt(x,M),G=rt(x,M);if(G>=8192)throw new Error("THREE.EXRLoader: Something is wrong with PIZ_COMPRESSION BITMAP_SIZE");if(z<=G)for(let _t=0;_t<G-z+1;_t++)P[_t+z]=Vt(x,M);let W=new Uint16Array(65536),$=N(P,W),nt=xt(x,M);re(h.array,x,M,nt,A,k);for(let _t=0;_t<h.inputChannels.length;++_t){let ft=I[_t];for(let pt=0;pt<I[_t].size;++pt)Nt(A,ft.start+pt,ft.nx,ft.size,ft.ny,ft.nx*ft.size,$)}Dt(W,A,k);let q=0,ct=new Uint8Array(A.buffer.byteLength);for(let _t=0;_t<h.lines;_t++)for(let ft=0;ft<h.inputChannels.length;ft++){let pt=I[ft],Pt=pt.nx*pt.size,dt=new Uint8Array(A.buffer,pt.end*2,Pt*2);ct.set(dt,q),q+=Pt*2,pt.end+=Pt}return new DataView(ct.buffer)}function j(h){let x=h.array.slice(h.offset.value,h.offset.value+h.size),M=Ys(x),A=h.inputChannels.length*h.lines*h.columns*h.totalBytes,P=new ArrayBuffer(A),k=new DataView(P),I=0,z=0,G=new Array(4);for(let W=0;W<h.lines;W++)for(let $=0;$<h.inputChannels.length;$++){let nt=0;switch(h.inputChannels[$].pixelType){case 1:G[0]=I,G[1]=G[0]+h.columns,I=G[1]+h.columns;for(let ct=0;ct<h.columns;++ct){let _t=M[G[0]++]<<8|M[G[1]++];nt+=_t,k.setUint16(z,nt,!0),z+=2}break;case 2:G[0]=I,G[1]=G[0]+h.columns,G[2]=G[1]+h.columns,I=G[2]+h.columns;for(let ct=0;ct<h.columns;++ct){let _t=M[G[0]++]<<24|M[G[1]++]<<16|M[G[2]++]<<8;nt+=_t,k.setUint32(z,nt,!0),z+=4}break}}return k}function et(h){let x=h.array,M=h.offset.value,A=h.columns,P=h.lines,k=h.inputChannels,I=h.totalBytes,z=ze.compression==="B44A_COMPRESSION",G=new Uint8Array(P*A*I),W=new Uint16Array(16),$=0;for(let nt=0;nt<k.length;nt++){let q=k[nt],ct=q.pixelType*2,_t=Math.ceil(A/q.xSampling),ft=Math.ceil(P/q.ySampling),pt=q.xSampling===1&&q.ySampling===1;if(q.pixelType!==1){for(let Xt=0;Xt<ft;Xt++)if(pt){let Ot=Xt*A*I+$*A;for(let It=0;It<_t*ct;It++)G[Ot+It]=x[M++]}else M+=_t*ct;$+=ct;continue}let Pt=Math.ceil(_t/4),dt=Math.ceil(ft/4);for(let Xt=0;Xt<dt;Xt++)for(let Ot=0;Ot<Pt;Ot++){if(z&&x[M+2]>=52){let It=x[M]<<8|x[M+1],bt=It&32768?It&32767:~It&65535;W.fill(bt),M+=3}else{let It=x[M]<<8|x[M+1],bt=x[M+2]>>2,Bt=32<<bt,he=It+((x[M+2]<<4|x[M+3]>>4)&63)*(1<<bt)-Bt&65535,Ht=he+((x[M+3]<<2|x[M+4]>>6)&63)*(1<<bt)-Bt&65535,zt=Ht+(x[M+4]&63)*(1<<bt)-Bt&65535,ee=It+(x[M+5]>>2&63)*(1<<bt)-Bt&65535,te=he+((x[M+5]<<4|x[M+6]>>4)&63)*(1<<bt)-Bt&65535,Pe=Ht+((x[M+6]<<2|x[M+7]>>6)&63)*(1<<bt)-Bt&65535,fe=zt+(x[M+7]&63)*(1<<bt)-Bt&65535,un=ee+(x[M+8]>>2&63)*(1<<bt)-Bt&65535,ls=te+((x[M+8]<<4|x[M+9]>>4)&63)*(1<<bt)-Bt&65535,$s=Pe+((x[M+9]<<2|x[M+10]>>6)&63)*(1<<bt)-Bt&65535,Bn=fe+(x[M+10]&63)*(1<<bt)-Bt&65535,Ni=un+(x[M+11]>>2&63)*(1<<bt)-Bt&65535,ha=ls+((x[M+11]<<4|x[M+12]>>4)&63)*(1<<bt)-Bt&65535,ua=$s+((x[M+12]<<2|x[M+13]>>6)&63)*(1<<bt)-Bt&65535,fa=Bn+(x[M+13]&63)*(1<<bt)-Bt&65535,js=[It,ee,un,Ni,he,te,ls,ha,Ht,Pe,$s,ua,zt,fe,Bn,fa];for(let cs=0;cs<16;cs++)W[cs]=js[cs]&32768?js[cs]&32767:~js[cs]&65535;M+=14}if(q.pLinear){if(L===null){L=new Uint16Array(65536);for(let It=0;It<65536;It++)if((It&31744)===31744||It>32768)L[It]=0;else{let bt=Q(It);L[It]=bt<=0?0:Pn.toHalfFloat(8*Math.log(bt))}}for(let It=0;It<16;It++)W[It]=L[W[It]]}for(let It=0;It<4;It++){let bt=Xt*4+It;if(!(bt>=ft))for(let Bt=0;Bt<4;Bt++){let he=Ot*4+Bt;if(he>=_t)continue;let Ht=W[It*4+Bt];for(let zt=0;zt<q.ySampling;zt++){let ee=bt*q.ySampling+zt;if(!(ee>=P))for(let te=0;te<q.xSampling;te++){let Pe=he*q.xSampling+te;if(Pe>=A)continue;let fe=ee*A*I+$*A+Pe*2;G[fe]=Ht&255,G[fe+1]=Ht>>8&255}}}}}$+=2}return new DataView(G.buffer)}function yt(h){let x=h.viewer,M={value:h.offset.value},A=new Uint8Array(h.columns*h.lines*(h.inputChannels.length*h.type*2)),P={version:Ft(x,M),unknownUncompressedSize:Ft(x,M),unknownCompressedSize:Ft(x,M),acCompressedSize:Ft(x,M),dcCompressedSize:Ft(x,M),rleCompressedSize:Ft(x,M),rleUncompressedSize:Ft(x,M),rleRawSize:Ft(x,M),totalAcUncompressedCount:Ft(x,M),totalDcUncompressedCount:Ft(x,M),acCompression:Ft(x,M)};if(P.version<2)throw new Error("THREE.EXRLoader: "+ze.compression+" version "+P.version+" is unsupported");let k=new Array,I=rt(x,M)-2;for(;I>0;){let ft=Mt(x.buffer,M),pt=Vt(x,M),Pt=pt>>2&3,dt=(pt>>4)-1,Xt=new Int8Array([dt])[0],Ot=Vt(x,M);k.push({name:ft,index:Xt,type:Ot,compression:Pt}),I-=ft.length+3}let z=ze.channels,G=new Array(h.inputChannels.length);for(let ft=0;ft<h.inputChannels.length;++ft){let pt=G[ft]={},Pt=z[ft];pt.name=Pt.name,pt.compression=0,pt.decoded=!1,pt.type=Pt.pixelType,pt.pLinear=Pt.pLinear,pt.width=h.columns,pt.height=h.lines}let W={idx:new Array(3)};for(let ft=0;ft<h.inputChannels.length;++ft){let pt=G[ft],Pt=pt.name.lastIndexOf("."),dt=Pt>=0?pt.name.substring(Pt+1):pt.name;for(let Xt=0;Xt<k.length;++Xt){let Ot=k[Xt];dt===Ot.name&&pt.type===Ot.type&&(pt.compression=Ot.compression,Ot.index>=0&&(W.idx[Ot.index]=ft),pt.offset=ft)}}let $,nt,q;if(P.acCompressedSize>0)switch(P.acCompression){case 0:$=new Uint16Array(P.totalAcUncompressedCount),re(h.array,x,M,P.acCompressedSize,$,P.totalAcUncompressedCount);break;case 1:let ft=h.array.slice(M.value,M.value+P.totalAcUncompressedCount),pt=Ys(ft);$=new Uint16Array(pt.buffer),M.value+=P.totalAcUncompressedCount;break}if(P.dcCompressedSize>0){let ft={array:h.array,offset:M,size:P.dcCompressedSize};nt=new Uint16Array(b(ft).buffer),M.value+=P.dcCompressedSize}if(P.rleRawSize>0){let ft=h.array.slice(M.value,M.value+P.rleCompressedSize),pt=Ys(ft);q=le(pt.buffer),M.value+=P.rleCompressedSize}let ct=0,_t=new Array(G.length);for(let ft=0;ft<_t.length;++ft)_t[ft]=new Array;for(let ft=0;ft<h.lines;++ft)for(let pt=0;pt<G.length;++pt)_t[pt].push(ct),ct+=G[pt].width*h.type*2;W.idx[0]!==void 0&&G[W.idx[0]]&&Ce(W,_t,G,$,nt,A);for(let ft=0;ft<G.length;++ft){let pt=G[ft];if(!pt.decoded)switch(pt.compression){case 2:let Pt=0,dt=0;for(let Xt=0;Xt<h.lines;++Xt){let Ot=_t[ft][Pt];for(let It=0;It<pt.width;++It){for(let bt=0;bt<2*pt.type;++bt)A[Ot++]=q[dt+bt*pt.width*pt.height];dt++}Pt++}break;case 1:Ie(ft,_t,G,$,nt,A);break;default:throw new Error("THREE.EXRLoader: unsupported channel compression")}}return new DataView(A.buffer)}function Mt(h,x){let M=new Uint8Array(h),A=0;for(;M[x.value+A]!=0;)A+=1;let P=new TextDecoder().decode(M.slice(x.value,x.value+A));return x.value=x.value+A+1,P}function it(h,x,M){let A=new TextDecoder().decode(new Uint8Array(h).slice(x.value,x.value+M));return x.value=x.value+M,A}function at(h,x){let M=Ut(h,x),A=xt(h,x);return[M,A]}function At(h,x){let M=xt(h,x),A=xt(h,x);return[M,A]}function Ut(h,x){let M=h.getInt32(x.value,!0);return x.value=x.value+4,M}function xt(h,x){let M=h.getUint32(x.value,!0);return x.value=x.value+4,M}function wt(h,x){let M=h[x.value];return x.value=x.value+1,M}function Vt(h,x){let M=h.getUint8(x.value);return x.value=x.value+1,M}let Ft=function(h,x){let M=Number(h.getBigInt64(x.value,!0));return x.value+=8,M};function Yt(h,x){let M=h.getFloat32(x.value,!0);return x.value+=4,M}function B(h,x){return Pn.toHalfFloat(Yt(h,x))}function Q(h){let x=(h&31744)>>10,M=h&1023;return(h>>15?-1:1)*(x?x===31?M?NaN:1/0:Math.pow(2,x-15)*(1+M/1024):6103515625e-14*(M/1024))}function rt(h,x){let M=h.getUint16(x.value,!0);return x.value+=2,M}function Tt(h,x){return Q(rt(h,x))}function Rt(h,x,M,A){let P=M.value,k=[];for(;M.value<P+A-1;){let I=Mt(x,M),z=Ut(h,M),G=Vt(h,M);M.value+=3;let W=Ut(h,M),$=Ut(h,M);k.push({name:I,pixelType:z,pLinear:G,xSampling:W,ySampling:$})}return M.value+=1,k}function ut(h,x){let M=Yt(h,x),A=Yt(h,x),P=Yt(h,x),k=Yt(h,x),I=Yt(h,x),z=Yt(h,x),G=Yt(h,x),W=Yt(h,x);return{redX:M,redY:A,greenX:P,greenY:k,blueX:I,blueY:z,whiteX:G,whiteY:W}}function Wt(h,x){let M=["NO_COMPRESSION","RLE_COMPRESSION","ZIPS_COMPRESSION","ZIP_COMPRESSION","PIZ_COMPRESSION","PXR24_COMPRESSION","B44_COMPRESSION","B44A_COMPRESSION","DWAA_COMPRESSION","DWAB_COMPRESSION"],A=Vt(h,x);return M[A]}function Gt(h,x){let M=Ut(h,x),A=Ut(h,x),P=Ut(h,x),k=Ut(h,x);return{xMin:M,yMin:A,xMax:P,yMax:k}}function be(h,x){let M=["INCREASING_Y","DECREASING_Y","RANDOM_Y"],A=Vt(h,x);return M[A]}function _e(h,x){let M=["ENVMAP_LATLONG","ENVMAP_CUBE"],A=Vt(h,x);return M[A]}function yn(h,x){let M=["ONE_LEVEL","MIPMAP_LEVELS","RIPMAP_LEVELS"],A=["ROUND_DOWN","ROUND_UP"],P=xt(h,x),k=xt(h,x),I=Vt(h,x);return{xSize:P,ySize:k,levelMode:M[I&15],roundingMode:A[I>>4]}}function vn(h,x){let M=Yt(h,x),A=Yt(h,x);return[M,A]}function ul(h,x){let M=Yt(h,x),A=Yt(h,x),P=Yt(h,x);return[M,A,P]}function fl(h,x,M,A,P){if(A==="string"||A==="stringvector"||A==="iccProfile")return it(x,M,P);if(A==="chlist")return Rt(h,x,M,P);if(A==="chromaticities")return ut(h,M);if(A==="compression")return Wt(h,M);if(A==="box2i")return Gt(h,M);if(A==="envmap")return _e(h,M);if(A==="tiledesc")return yn(h,M);if(A==="lineOrder")return be(h,M);if(A==="float")return Yt(h,M);if(A==="v2f")return vn(h,M);if(A==="v3f")return ul(h,M);if(A==="int")return Ut(h,M);if(A==="rational")return at(h,M);if(A==="timecode")return At(h,M);if(A==="preview"||A==="deepImageState"||A==="idmanifest")return M.value+=P,"skipped";M.value+=P}function na(h,x){let M=Math.log2(h);return x=="ROUND_DOWN"?Math.floor(M):Math.ceil(M)}function Js(h,x,M){let A=0;switch(h.levelMode){case"ONE_LEVEL":A=1;break;case"MIPMAP_LEVELS":A=na(Math.max(x,M),h.roundingMode)+1;break;case"RIPMAP_LEVELS":throw new Error("THREE.EXRLoader: RIPMAP_LEVELS tiles currently unsupported.")}return A}function ia(h,x,M,A){let P=new Array(h);for(let k=0;k<h;k++){let I=1<<k,z=x/I|0;A=="ROUND_UP"&&z*I<x&&(z+=1);let G=Math.max(z,1);P[k]=(G+M-1)/M|0}return P}function sa(){let h=this,x=h.offset,M={value:0};for(let A=0;A<h.tileCount;A++){let P=Ut(h.viewer,x),k=Ut(h.viewer,x);x.value+=8,h.size=xt(h.viewer,x);let I=P*h.blockWidth,z=k*h.blockHeight;h.columns=I+h.blockWidth>h.width?h.width-I:h.blockWidth,h.lines=z+h.blockHeight>h.height?h.height-z:h.blockHeight;let G=h.columns*h.totalBytes,$=h.size<h.lines*G?h.uncompress(h):ue(h);x.value+=h.size;for(let nt=0;nt<h.lines;nt++){let q=nt*h.columns*h.totalBytes;for(let ct=0;ct<h.inputChannels.length;ct++){let _t=ze.channels[ct].name,ft=h.channelByteOffsets[_t]*h.columns,pt=h.decodeChannels[_t];if(pt===void 0)continue;M.value=q+ft;let Pt=(h.height-(1+z+nt))*h.outLineWidth;for(let dt=0;dt<h.columns;dt++){let Xt=Pt+(dt+I)*h.outputChannels+pt;h.byteArray[Xt]=h.getter($,M)}}}}}function ra(){let h=this,x=h.offset,M={value:0};for(let A=0;A<h.height/h.blockHeight;A++){let P=Ut(h.viewer,x)-ze.dataWindow.yMin;h.size=xt(h.viewer,x),h.lines=P+h.blockHeight>h.height?h.height-P:h.blockHeight;let k=h.columns*h.totalBytes,z=h.size<h.lines*k?h.uncompress(h):ue(h);x.value+=h.size;for(let G=0;G<h.lines;G++){let W=P+G,$=G*k,nt=(h.height-1-W)*h.outLineWidth;for(let q=0;q<h.inputChannels.length;q++){let ct=ze.channels[q].name,_t=h.channelByteOffsets[ct]*h.columns,ft=h.decodeChannels[ct];if(ft!==void 0){M.value=$+_t;for(let pt=0;pt<h.columns;pt++){let Pt=nt+pt*h.outputChannels+ft;h.byteArray[Pt]=h.getter(z,M)}}}}}}function Kn(){let h=this,x=h.chunkOffsets,M={value:0};for(let A=0;A<x.length;A++){let P={value:x[A]};P.value+=4;let k=Ut(h.viewer,P)-ze.dataWindow.yMin;h.size=xt(h.viewer,P),h.lines=k+h.blockHeight>h.height?h.height-k:h.blockHeight;let I=h.columns*h.totalBytes,z=h.size<h.lines*I,G=h.offset;h.offset=P;let W=z?h.uncompress(h):ue(h);h.offset=G;for(let $=0;$<h.lines;$++){let nt=k+$,q=$*I,ct=(h.height-1-nt)*h.outLineWidth;for(let _t=0;_t<h.inputChannels.length;_t++){let ft=ze.channels[_t].name,pt=h.channelByteOffsets[ft]*h.columns,Pt=h.decodeChannels[ft];if(Pt!==void 0){M.value=q+pt;for(let dt=0;dt<h.columns;dt++){let Xt=ct+dt*h.outputChannels+Pt;h.byteArray[Xt]=h.getter(W,M)}}}}}}function rs(h,x,M,A){if(M===0)return null;let P=h.slice(x,x+M);switch(A){case"NO_COMPRESSION":return new DataView(P.buffer,P.byteOffset,P.byteLength);case"RLE_COMPRESSION":{let k=new Uint8Array(le(P.buffer.slice(P.byteOffset,P.byteOffset+P.byteLength))),I=new Uint8Array(k.length);return $t(k),Zt(k,I),new DataView(I.buffer)}case"ZIPS_COMPRESSION":{let k=Ys(P),I=new Uint8Array(k.length);return $t(k),Zt(k,I),new DataView(I.buffer)}default:throw new Error("THREE.EXRLoader: "+A+" is unsupported for deep data")}}function aa(){let h=this,x=h.chunkOffsets,M=h.width,A=h.height,P=h.deepChannels,k=ze.compression,I=h.multiPart,z=h.decodeChannels,G=h.outputChannels,W=h.byteArray instanceof Uint16Array,$=-1;for(let nt=0;nt<P.length;nt++)if(P[nt].name==="A"){$=nt;break}for(let nt=0;nt<x.length;nt++){let q={value:x[nt]};I&&(q.value+=4);let ct=Ut(h.viewer,q)-ze.dataWindow.yMin,_t=Ft(h.viewer,q),ft=Ft(h.viewer,q);Ft(h.viewer,q);let pt=rs(h.array,q.value,_t,k);if(q.value+=_t,pt===null)continue;let Pt=new Uint32Array(M);for(let Bt=0;Bt<M;Bt++)Pt[Bt]=pt.getUint32(Bt*4,!0);let dt=Pt[M-1];if(dt===0){q.value+=ft;continue}let Xt=rs(h.array,q.value,ft,k),Ot=[],It=0;for(let Bt=0;Bt<P.length;Bt++)Ot.push(It),It+=dt*P[Bt].bytesPerSample;let bt=(A-1-ct)*h.outLineWidth;for(let Bt=0;Bt<M;Bt++){let he=Bt===0?0:Pt[Bt-1],zt=Pt[Bt]-he;if(zt===0)continue;let ee=new Float32Array(G),te=0;for(let fe=0;fe<zt;fe++){let un=he+fe,ls=1-te;if(ls<=0)break;let $s=1;if($>=0){let Bn=P[$].bytesPerSample,Ni=Ot[$]+un*Bn;$s=Bn===2?Q(Xt.getUint16(Ni,!0)):Xt.getFloat32(Ni,!0)}for(let Bn=0;Bn<P.length;Bn++){let Ni=P[Bn],ha=z[Ni.name];if(ha===void 0)continue;let ua=Ni.bytesPerSample,fa=Ot[Bn]+un*ua,js=ua===2?Q(Xt.getUint16(fa,!0)):Xt.getFloat32(fa,!0);ee[ha]+=js*ls}te+=$s*ls}z.A!==void 0&&(ee[z.A]=te);let Pe=bt+Bt*G;for(let fe=0;fe<G;fe++)h.byteArray[Pe+fe]=W?Pn.toHalfFloat(ee[fe]):ee[fe]}}}function Ks(h,x,M){let A={},P=!1;for(;;){let k=Mt(x,M);if(k==="")break;P=!0;let I=Mt(x,M),z=xt(h,M),G=fl(h,x,M,I,z);G===void 0?console.warn(`THREE.EXRLoader: Skipped unknown header attribute type '${I}'.`):A[k]=G}return P?A:null}function as(h,x,M){if(h.getUint32(0,!0)!=20000630)throw new Error("THREE.EXRLoader: Provided file doesn't appear to be in OpenEXR format.");let A=h.getUint8(4),P=h.getUint8(5),k={singleTile:!!(P&2),longName:!!(P&4),deepFormat:!!(P&8),multiPart:!!(P&16)};M.value=8;let I=[];if(k.multiPart){for(;;){let z=Ks(h,x,M);if(z===null)break;z.version=A,z.spec=k,I.push(z)}if(I.length===0)throw new Error("THREE.EXRLoader: No valid part headers found.")}else{let z=Ks(h,x,M);z.version=A,z.spec=k,I.push(z)}return I}function oa(h,x,M,A,P,k){let I={size:0,viewer:x,array:M,offset:A,width:h.dataWindow.xMax-h.dataWindow.xMin+1,height:h.dataWindow.yMax-h.dataWindow.yMin+1,inputChannels:h.channels,channelByteOffsets:{},shouldExpand:!1,yCbCr:!1,totalBytes:null,columns:null,lines:null,type:null,uncompress:null,getter:null,format:null,colorSpace:pn};switch(h.compression){case"NO_COMPRESSION":I.blockHeight=1,I.uncompress=ue;break;case"RLE_COMPRESSION":I.blockHeight=1,I.uncompress=U;break;case"ZIPS_COMPRESSION":I.blockHeight=1,I.uncompress=b;break;case"ZIP_COMPRESSION":I.blockHeight=16,I.uncompress=b;break;case"PIZ_COMPRESSION":I.blockHeight=32,I.uncompress=X;break;case"PXR24_COMPRESSION":I.blockHeight=16,I.uncompress=j;break;case"B44_COMPRESSION":case"B44A_COMPRESSION":I.blockHeight=32,I.uncompress=et;break;case"DWAA_COMPRESSION":I.blockHeight=32,I.uncompress=yt;break;case"DWAB_COMPRESSION":I.blockHeight=256,I.uncompress=yt;break;default:throw new Error("THREE.EXRLoader: "+h.compression+" is unsupported")}let z={};for(let q of h.channels)switch(q.name){case"BY":case"RY":case"Y":case"R":case"G":case"B":case"A":z[q.name]=!0,I.type=q.pixelType}let G=!1,W=!1;if(z.Y&&z.RY&&z.BY)I.outputChannels=4,I.yCbCr=!0;else if(z.R&&z.G&&z.B)I.outputChannels=4;else if(z.Y)I.outputChannels=1;else throw new Error("THREE.EXRLoader: file contains unsupported data channels.");switch(I.outputChannels){case 4:k==Le?(G=!z.A,I.format=Le,I.colorSpace=pn,I.outputChannels=4,I.decodeChannels={R:0,G:1,B:2,A:3}):k==cn?(I.format=cn,I.colorSpace=pn,I.outputChannels=2,I.decodeChannels={R:0,G:1}):k==di?(I.format=di,I.colorSpace=pn,I.outputChannels=1,I.decodeChannels={R:0}):W=!0;break;case 1:k==Le?(G=!0,I.format=Le,I.colorSpace=pn,I.outputChannels=4,I.shouldExpand=!0,I.decodeChannels={Y:0}):k==cn?(I.format=cn,I.colorSpace=pn,I.outputChannels=2,I.shouldExpand=!0,I.decodeChannels={Y:0}):k==di?(I.format=di,I.colorSpace=pn,I.outputChannels=1,I.decodeChannels={Y:0}):W=!0;break;default:W=!0}if(W)throw new Error("THREE.EXRLoader: invalid output format for specified file.");if(I.yCbCr&&(I.format=Le,I.outputChannels=4,I.decodeChannels={Y:0,RY:1,BY:2},G=!0),I.type==1)switch(P){case qe:I.getter=Tt;break;case en:I.getter=rt;break}else if(I.type==2)switch(P){case qe:I.getter=Yt;break;case en:I.getter=B}else throw new Error("THREE.EXRLoader: unsupported pixelType "+I.type+" for "+h.compression+".");I.columns=I.width;let $=I.width*I.height*I.outputChannels;switch(P){case qe:I.byteArray=new Float32Array($),G&&I.byteArray.fill(1,0,$);break;case en:I.byteArray=new Uint16Array($),G&&I.byteArray.fill(15360,0,$);break;default:console.error("THREE.EXRLoader: unsupported type: ",P);break}let nt=0;for(let q of h.channels)I.decodeChannels[q.name]!==void 0&&(I.channelByteOffsets[q.name]=nt),nt+=q.pixelType*2;if(I.totalBytes=nt,I.outLineWidth=I.width*I.outputChannels,h.spec.deepFormat){I.deepChannels=[];let q=0;for(let ct of h.channels){let _t=ct.pixelType===0?4:ct.pixelType*2;I.deepChannels.push({name:ct.name,pixelType:ct.pixelType,bytesPerSample:_t}),q+=_t}I.deepBytesPerSample=q,I.chunkOffsets=h._chunkOffsets,I.multiPart=h.spec.multiPart,I.decode=aa.bind(I)}else if(h.spec.singleTile){I.blockHeight=h.tiles.ySize,I.blockWidth=h.tiles.xSize;let q=Js(h.tiles,I.width,I.height),ct=ia(q,I.width,h.tiles.xSize,h.tiles.roundingMode),_t=ia(q,I.height,h.tiles.ySize,h.tiles.roundingMode);I.tileCount=ct[0]*_t[0];for(let ft=0;ft<q;ft++)for(let pt=0;pt<_t[ft];pt++)for(let Pt=0;Pt<ct[ft];Pt++)Ft(x,A);I.decode=sa.bind(I)}else if(h.spec.multiPart)I.blockWidth=I.width,I.chunkOffsets=h._chunkOffsets,I.decode=Kn.bind(I);else{I.blockWidth=I.width;let q=Math.ceil(I.height/I.blockHeight);for(let ct=0;ct<q;ct++)Ft(x,A);I.decode=ra.bind(I)}return I}let $n={value:0},Li=new DataView(t),la=new Uint8Array(t),os=as(Li,t,$n),ca=Math.max(0,Math.min(this.part,os.length-1)),ze=os[ca];if(ze.spec.multiPart||ze.spec.deepFormat)for(let h=0;h<os.length;h++){let x=os[h].chunkCount;if(h===ca){ze._chunkOffsets=[];for(let M=0;M<x;M++)ze._chunkOffsets.push(Ft(Li,$n))}else for(let M=0;M<x;M++)Ft(Li,$n)}let rn=oa(ze,Li,la,$n,this.type,this.outputFormat);if(rn.decode(),rn.shouldExpand){let h=rn.byteArray;if(this.outputFormat==Le)for(let x=0;x<h.length;x+=4)h[x+2]=h[x+1]=h[x];else if(this.outputFormat==cn)for(let x=0;x<h.length;x+=2)h[x+1]=h[x]}if(rn.yCbCr){let h=rn.byteArray,x=rn.width*rn.height;if(this.type===en)for(let M=0;M<x;M++){let A=M*4,P=Q(h[A]),k=Q(h[A+1]),I=Q(h[A+2]),z=(1+k)*P,G=(1+I)*P,W=(P-z*.2126-G*.0722)/.7152;h[A]=Pn.toHalfFloat(Math.max(0,z)),h[A+1]=Pn.toHalfFloat(Math.max(0,W)),h[A+2]=Pn.toHalfFloat(Math.max(0,G))}else for(let M=0;M<x;M++){let A=M*4,P=h[A],k=h[A+1],I=h[A+2],z=(1+k)*P,G=(1+I)*P;h[A]=Math.max(0,z),h[A+1]=Math.max(0,(P-z*.2126-G*.0722)/.7152),h[A+2]=Math.max(0,G)}}return{header:ze,width:rn.width,height:rn.height,data:rn.byteArray,format:rn.format,colorSpace:rn.colorSpace,type:this.type,minFilter:Te,magFilter:Te,generateMipmaps:!1,flipY:!1}}setDataType(t){return this.type=t,this}setOutputFormat(t){return this.outputFormat=t,this}setPart(t){return this.part=t,this}};var dh=class extends Ps{constructor(){super(),this.name="RoomEnvironment",this.position.y=-3.5;let t=new Hn;t.deleteAttribute("uv");let e=new Zi({side:Xe}),n=new Zi,s=new $i(16777215,900,28,2);s.position.set(.418,16.199,.3),this.add(s);let r=new ve(t,e);r.position.set(-.757,13.219,.717),r.scale.set(31.713,28.305,28.591),this.add(r);let a=new vr(t,n,6),o=new we;o.position.set(-10.906,2.009,1.846),o.rotation.set(0,-.195,0),o.scale.set(2.328,7.905,4.651),o.updateMatrix(),a.setMatrixAt(0,o.matrix),o.position.set(-5.607,-.754,-.758),o.rotation.set(0,.994,0),o.scale.set(1.97,1.534,3.955),o.updateMatrix(),a.setMatrixAt(1,o.matrix),o.position.set(6.167,.857,7.803),o.rotation.set(0,.561,0),o.scale.set(3.927,6.285,3.687),o.updateMatrix(),a.setMatrixAt(2,o.matrix),o.position.set(-2.017,.018,6.124),o.rotation.set(0,.333,0),o.scale.set(2.002,4.566,2.064),o.updateMatrix(),a.setMatrixAt(3,o.matrix),o.position.set(2.291,-.756,-2.621),o.rotation.set(0,-.286,0),o.scale.set(1.546,1.552,1.496),o.updateMatrix(),a.setMatrixAt(4,o.matrix),o.position.set(-2.193,-.369,-5.547),o.rotation.set(0,.516,0),o.scale.set(3.875,3.487,2.986),o.updateMatrix(),a.setMatrixAt(5,o.matrix),this.add(a);let l=new ve(t,Zs(50));l.position.set(-16.116,14.37,8.208),l.scale.set(.1,2.428,2.739),this.add(l);let c=new ve(t,Zs(50));c.position.set(-16.109,18.021,-8.207),c.scale.set(.1,2.425,2.751),this.add(c);let f=new ve(t,Zs(17));f.position.set(14.904,12.198,-1.832),f.scale.set(.15,4.265,6.331),this.add(f);let u=new ve(t,Zs(43));u.position.set(-.462,8.89,14.52),u.scale.set(4.38,5.441,.088),this.add(u);let d=new ve(t,Zs(20));d.position.set(3.235,11.486,-12.541),d.scale.set(2.5,2,.1),this.add(d);let p=new ve(t,Zs(100));p.position.set(0,20,0),p.scale.set(1,.1,1),this.add(p)}dispose(){let t=new Set;this.traverse(e=>{e.isMesh&&(t.add(e.geometry),t.add(e.material))});for(let e of t)e.dispose()}};function Zs(i){return new Pr({color:0,emissive:16777215,emissiveIntensity:i})}export{uo as ACESFilmicToneMapping,bn as Box3,fh as EXRLoader,Yc as OrbitControls,ui as OrthographicCamera,$r as PMREMGenerator,dh as RoomEnvironment,pe as SRGBColorSpace,Ps as Scene,uh as USDLoader,H as Vector3,Xc as WebGLRenderer,oh as unzipSync,bx as zipSync};
/*! Bundled license information:

three/build/three.core.js:
three/build/three.module.js:
  (**
   * @license
   * Copyright 2010-2026 Three.js Authors
   * SPDX-License-Identifier: MIT
   *)

three/examples/jsm/libs/fflate.module.js:
  (*!
  fflate - fast JavaScript compression/decompression
  <https://101arrowz.github.io/fflate>
  Licensed under MIT. https://github.com/101arrowz/fflate/blob/master/LICENSE
  version 0.8.2
  *)
*/
