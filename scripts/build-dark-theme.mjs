// Generates theme-dark.css: dark-mode overrides derived from the light stylesheets.
// Every hardcoded colour is remapped by its role (text, surface, tint, shadow), so new
// light-mode rules get a matching dark rule by re-running `npm run build:theme`.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCES=['professional.css','expansion.css','fullstack.css','suite.css','navigation.css'];
const COLOR_PROPS=/^(color|background|background-color|background-image|border|border-(top|right|bottom|left)(-color)?|border-color|outline|outline-color|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration-color|column-rule)$/;
const COLOR_RE=/#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3,4}\b|rgba?\([^)]*\)|\bwhite\b/gi;

const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
function parse(token){
  token=token.toLowerCase();
  if(token==='white')return {r:255,g:255,b:255,a:1};
  if(token.startsWith('#')){let h=token.slice(1);if(h.length<=4)h=[...h].map(c=>c+c).join('');return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:h.length===8?parseInt(h.slice(6,8),16)/255:1}}
  const p=token.match(/[\d.]+%?/g).map(Number.parseFloat);return {r:p[0],g:p[1],b:p[2],a:p[3]??1};
}
function toHsl({r,g,b}){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;let h=0,s=0;if(d){s=d/(1-Math.abs(2*l-1));h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h*=60;if(h<0)h+=360}return {h,s,l,chroma:d}}
const out=(h,s,l,a=1)=>`hsl(${Math.round(h)} ${Math.round(clamp(s)*100)}% ${Math.round(clamp(l)*100)}%${a<1?` / ${+a.toFixed(3)}`:''})`;
const NAVY=220;

function remap(token,role){
  const c=parse(token),{h,s,l,chroma}=toHsl(c),a=c.a,neutral=chroma<0.1||(chroma<0.18&&l<0.82),tint=!neutral&&l>0.82;
  if(role==='text'){
    if(l>=0.8&&a>0.5)return null;                                   // light text already sits on accents
    if(neutral)return out(NAVY,Math.min(s,0.2),clamp(0.42+(1-l)*0.62,0.5,0.93),a);    // body copy → light, muted → mid grey
    return out(h,Math.min(s,0.85),Math.max(l,0.72),a);                // accents → lifted for contrast
  }
  if(role==='border'){
    if(neutral)return out(NAVY,0.35,l>0.85?0.72:0.68,Math.min(a,1)*(l>0.85?0.12:0.55)*(a<1?1:0.35));
    return out(h,Math.min(s,0.8),Math.max(l,0.62),a);
  }
  if(role==='shadow'){
    if(neutral&&l>0.86)return out(NAVY,0.3,0.8,Math.min(0.035,a*0.05)); // neumorphic highlight → faint rim
    if(neutral)return `rgb(2 6 14 / ${+clamp(a<1?a*1.3+0.12:0.48,0.18,0.62).toFixed(2)})`;
    return out(h,s,l,a*0.6);
  }
  // surfaces
  if(neutral){
    if(a<1&&l>0.85)return out(NAVY,0.32,0.7,a*0.12);                   // white veils → faint lift
    if(l>0.6)return out(NAVY,0.3,clamp(0.135+(l-0.92)*0.35,0.1,0.18),a); // light panels → navy surfaces
    if(l<0.45&&a<1)return `rgb(3 6 12 / ${+clamp(a*1.6,0.3,0.75).toFixed(2)})`; // scrims
    return out(NAVY,0.25,0.25,a);
  }
  if(tint)return a<1?out(h,s,0.6,a*0.35):out(h,Math.min(s*0.55,0.5),0.19,a);
  return null;                                                         // saturated accents stay
}
const roleFor=prop=>/shadow/.test(prop)?'shadow':prop==='color'||/^(fill|stroke|caret-color|accent-color|text-decoration-color)$/.test(prop)?'text':/^(border|outline|column-rule)/.test(prop)?'border':'surface';

function transformValue(prop,value){
  if(/var\(--/.test(value)&&!COLOR_RE.test(value)){COLOR_RE.lastIndex=0;return null}
  COLOR_RE.lastIndex=0;let changed=false;
  const next=value.replace(COLOR_RE,token=>{const r=remap(token,roleFor(prop));if(r){changed=true;return r}return token});
  return changed?next:null;
}
function darkSelector(sel){
  sel=sel.trim();
  if(!sel||/\.dark\b|:root|view-transition|^html\b/.test(sel))return null;
  if(/^body\b/.test(sel))return sel.replace(/^body/,'body.dark');
  return `body.dark ${sel}`;
}
function splitTopLevel(text,sep){const parts=[];let depth=0,cur='';for(const ch of text){if(ch==='('||ch==='[')depth++;if(ch===')'||ch===']')depth--;if(ch===sep&&!depth){parts.push(cur);cur=''}else cur+=ch}parts.push(cur);return parts}
function declarations(body){return splitTopLevel(body,';').map(d=>{const i=d.indexOf(':');return i<0?null:[d.slice(0,i).trim().toLowerCase(),d.slice(i+1).trim()]}).filter(Boolean)}

// Minimal CSS walker: returns nested blocks for @media/@supports, skips @keyframes/@import/@font-face/@view-transition.
function walk(css){
  css=css.replace(/\/\*[\s\S]*?\*\//g,'');const rules=[];let i=0;
  const readBlock=start=>{let depth=0;for(let j=start;j<css.length;j++){if(css[j]==='{')depth++;else if(css[j]==='}'){depth--;if(!depth)return j}}return css.length};
  function parseRange(from,to,wrap){
    let k=from;
    while(k<to){
      const open=css.indexOf('{',k);if(open<0||open>=to)break;
      const semi=css.indexOf(';',k);if(css.slice(k).trimStart().startsWith('@import')&&semi>-1&&semi<open){k=semi+1;continue}
      const prelude=css.slice(k,open).trim(),close=readBlock(open);
      if(prelude.startsWith('@media')||prelude.startsWith('@supports')){if(!/print/.test(prelude))parseRange(open+1,close,[...wrap,prelude])}
      else if(!prelude.startsWith('@'))rules.push({wrap,selector:prelude,body:css.slice(open+1,close)});
      k=close+1;
    }
  }
  parseRange(0,css.length,[]);return rules;
}

let output=`/* Generated by scripts/build-dark-theme.mjs — do not edit by hand. Hand-tuned dark styles live in theme.css. */\n`;let count=0;
for(const file of SOURCES){
  const css=await readFile(path.join(root,file),'utf8');output+=`\n/* ${file} */\n`;
  for(const rule of walk(css)){
    const selectors=splitTopLevel(rule.selector,',').map(darkSelector).filter(Boolean);if(!selectors.length)continue;
    const decls=declarations(rule.body).filter(([prop])=>COLOR_PROPS.test(prop)).map(([prop,value])=>{const important=/!important\s*$/.test(value),clean=value.replace(/!important\s*$/,'').trim(),next=transformValue(prop,clean);return next?`${prop}:${next}${important?'!important':''}`:null}).filter(Boolean);
    if(!decls.length)continue;count++;
    const block=`${selectors.join(',')}{${decls.join(';')}}`;
    output+=rule.wrap.length?`${rule.wrap.join('{')}{${block}${'}'.repeat(rule.wrap.length)}\n`:`${block}\n`;
  }
}
await writeFile(path.join(root,'theme-dark.css'),output);
console.log(`theme-dark.css: ${count} rules`);
