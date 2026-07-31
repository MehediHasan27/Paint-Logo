/* =====================================================================
   LOGO CREW — surface
   Everything the tools actually touch.

   A slot owns a small canvas. The logo artwork lives on one layer, its COVERAGE lives on
   another, and the coverage is stamped at whatever position the brush tip / roller / charge
   front happens to be that frame. Nothing here is on a timer: if the hand stops, the paint
   stops. Completed layers are flattened so only the active one is recomposited per frame.

   Light theme  : layers stack up — logo, then white wash, then the next logo on top of it,
                  exactly like a real painted sign.
   Dark theme   : the slot is a mounted panel. `map` carries the unlit tube (so it is only
                  visible where the work lamp falls) and `emissiveMap` carries the glow,
                  masked by a charge front that grows out of the socket the plug went into.
   ===================================================================== */
(function(){
"use strict";
const CREW = window.CREW;
if(!CREW || CREW.dead) return;

const { clamp, lerp, easeIO, easeOut, hash, CFG, S, vx, vy } = CREW;
const T3 = THREE;

const CAN_FILTER = (() => {
  const c = document.createElement("canvas").getContext("2d");
  c.filter = "blur(2px)";
  return c.filter === "blur(2px)";
})();

/* ---------------------------------------------------------------------
   canvas helpers
   --------------------------------------------------------------------- */
function cv(w,h){
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w));
  c.height= Math.max(2, Math.round(h));
  return c;
}
function clear(c){ c.getContext("2d").clearRect(0,0,c.width,c.height); }

/* ---------------------------------------------------------------------
   LOGO ARTWORK
   Marks are drawn, not fonts, so each company reads as a different brand rather than the
   same word in five colours.
   --------------------------------------------------------------------- */
function drawMark(x, kind, cx, cy, r, col){
  x.save();
  x.translate(cx, cy);
  x.strokeStyle = col; x.fillStyle = col;
  x.lineWidth = r*0.30; x.lineCap="round"; x.lineJoin="round";
  switch(kind){
    case "chevron":
      x.beginPath();
      x.moveTo(-r*0.72, r*0.42); x.lineTo(0, -r*0.52); x.lineTo(r*0.72, r*0.42);
      x.stroke();
      x.beginPath();
      x.moveTo(-r*0.72, r*0.92); x.lineTo(0, 0); x.lineTo(r*0.72, r*0.92);
      x.stroke();
      break;
    case "halfdot":
      x.beginPath(); x.arc(0,0,r*0.82, -Math.PI/2, Math.PI/2); x.fill();
      x.beginPath(); x.arc(0,0,r*0.82, Math.PI/2, -Math.PI/2); x.lineWidth=r*0.24; x.stroke();
      break;
    case "wing":
      x.beginPath();
      x.moveTo(-r*0.85, r*0.55);
      x.quadraticCurveTo(-r*0.05, r*0.30, r*0.05, -r*0.80);
      x.quadraticCurveTo(r*0.42, r*0.10, r*0.86, r*0.55);
      x.closePath(); x.fill();
      break;
    case "fold":
      x.beginPath();
      x.moveTo(-r*0.78,-r*0.72); x.lineTo(r*0.34,-r*0.72); x.lineTo(r*0.78,-r*0.24);
      x.lineTo(r*0.78, r*0.78); x.lineTo(-r*0.78, r*0.78); x.closePath();
      x.lineWidth=r*0.24; x.stroke();
      x.beginPath(); x.moveTo(r*0.34,-r*0.72); x.lineTo(r*0.34,-r*0.24); x.lineTo(r*0.78,-r*0.24);
      x.stroke();
      break;
    case "bars":
      for(let i=0;i<3;i++){
        const h = r*(0.42 + i*0.42);
        x.fillRect(-r*0.80 + i*r*0.58, r*0.80-h, r*0.36, h);
      }
      break;
    case "clock":
      x.lineWidth=r*0.20;
      x.beginPath(); x.arc(0,0,r*0.78,0,6.2832); x.stroke();
      x.beginPath(); x.moveTo(0,0); x.lineTo(0,-r*0.46); x.moveTo(0,0); x.lineTo(r*0.40,r*0.12);
      x.stroke();
      break;
    case "ring":
      x.lineWidth=r*0.26;
      x.beginPath(); x.arc(0,0,r*0.74, -0.35, 4.55); x.stroke();
      x.beginPath(); x.arc(r*0.68, r*0.30, r*0.20, 0, 6.2832); x.fill();
      break;
    case "corner":
      x.beginPath();
      x.moveTo(-r*0.80,-r*0.80); x.lineTo(r*0.80,-r*0.80); x.lineTo(r*0.80,r*0.10);
      x.lineTo(-r*0.10, r*0.80); x.lineTo(-r*0.80, r*0.80); x.closePath();
      x.fill();
      x.globalCompositeOperation="destination-out";
      x.beginPath(); x.moveTo(r*0.80,r*0.10); x.lineTo(-r*0.10,r*0.80); x.lineTo(r*0.80,r*0.80);
      x.closePath(); x.fill();
      x.globalCompositeOperation="source-over";
      break;
    case "leaf":
      x.beginPath();
      x.moveTo(0, r*0.86);
      x.quadraticCurveTo(-r*0.95, r*0.10, 0, -r*0.86);
      x.quadraticCurveTo(r*0.95, r*0.10, 0, r*0.86);
      x.closePath(); x.fill();
      break;
    case "wave":
      x.lineWidth=r*0.22;
      for(let i=0;i<2;i++){
        const yy = -r*0.28 + i*r*0.62;
        x.beginPath();
        x.moveTo(-r*0.86, yy);
        x.bezierCurveTo(-r*0.42, yy-r*0.44, -r*0.02, yy+r*0.44, r*0.42, yy);
        x.bezierCurveTo(r*0.62, yy-r*0.22, r*0.74, yy-r*0.16, r*0.86, yy-r*0.12);
        x.stroke();
      }
      break;
  }
  x.restore();
}

/* the wordmark, laid out to fill the slot with the mark on the left */
function layoutLogo(x, d, w, h){
  const pad  = h*0.16;
  const markR= h*0.235;
  const gap  = h*0.16;
  const left = pad + markR;
  const availW = w - left - markR - gap - pad;
  let size = h*0.34;
  const fam = `"Inter","Helvetica Neue",Helvetica,Arial,sans-serif`;
  x.font = `${d.weight} ${size}px ${fam}`;
  const track = (d.track||0)*size;
  const measure = () => {
    x.font = `${d.weight} ${size}px ${fam}`;
    let tw = 0;
    for(const ch of d.name) tw += x.measureText(ch).width + track;
    return tw - track;
  };
  let tw = measure();
  if(tw > availW){ size *= availW/tw; tw = measure(); }
  return { markR, markX:left, markY:h/2, textX:left+markR+gap, textY:h/2, size, tw,
           track:(d.track||0)*size, fam };
}
function paintText(x, d, L){
  x.textBaseline = "middle";
  x.textAlign = "left";
  x.font = `${d.weight} ${L.size}px ${L.fam}`;
  let cx = L.textX;
  for(const ch of d.name){
    x.fillText(ch, cx, L.textY);
    cx += x.measureText(ch).width + L.track;
  }
}

/* ---- painted look -------------------------------------------------
   A vector glyph reads as a decal. Real signwriting has a slightly ragged edge, uneven
   loading and visible nap, so the glyph is stamped a few times with sub-pixel offsets and
   then a bristle texture is multiplied through it.                                       */
function napTexture(w,h,seed,strength){
  const c = cv(w,h), x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0,0,w,h);
  x.globalCompositeOperation = "multiply";
  const K = strength == null ? 1 : strength;
  for(let i=0;i<Math.round(h*0.9);i++){
    const y = hash(seed+i*1.7)*h;
    const a = (0.05 + hash(seed+i*3.3)*0.16)*K;
    const th= 0.5 + hash(seed+i*5.1)*1.6;
    x.strokeStyle = `rgba(0,0,0,${a})`;
    x.lineWidth = th;
    x.beginPath();
    x.moveTo(-4, y);
    for(let px=0; px<=w; px+=w/6) x.lineTo(px, y + (hash(seed+i*7.7+px)-0.5)*h*0.02);
    x.stroke();
  }
  /* a few thin patches where the brush ran dry */
  for(let i=0;i<7;i++){
    const px=hash(seed+i*13.1)*w, py=hash(seed+i*17.3)*h, r=h*(0.10+hash(seed+i*19.7)*0.22);
    const g=x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,`rgba(0,0,0,${(0.10+hash(seed+i*23.9)*0.14)*K})`);
    g.addColorStop(1,"rgba(0,0,0,0)");
    x.fillStyle=g; x.beginPath(); x.arc(px,py,r,0,6.2832); x.fill();
  }
  return c;
}

function renderPaintArt(d, w, h, seed){
  const c = cv(w,h), x = c.getContext("2d");
  const L = layoutLogo(x, d, w, h);
  /* build the glyph shape once, at full strength, then knock it back */
  const g = cv(w,h), gx = g.getContext("2d");
  gx.fillStyle = "#000";
  const lg = layoutLogo(gx, d, w, h);
  for(let i=0;i<4;i++){
    gx.save();
    gx.globalAlpha = i===0 ? 1 : 0.34;
    gx.translate((hash(seed+i*4.1)-0.5)*h*0.020, (hash(seed+i*6.3)-0.5)*h*0.020);
    drawMark(gx, d.mark, lg.markX, lg.markY, lg.markR, "#000");
    paintText(gx, d, lg);
    gx.restore();
  }
  /* colour it */
  x.drawImage(g,0,0);
  x.globalCompositeOperation = "source-in";
  x.fillStyle = d.tint;
  x.fillRect(0,0,w,h);
  /* nap through it */
  x.globalCompositeOperation = "multiply";
  x.drawImage(napTexture(w,h,seed*3.7), 0, 0);
  /* keep the alpha of the glyph only */
  x.globalCompositeOperation = "destination-in";
  x.drawImage(g,0,0);
  x.globalCompositeOperation = "source-over";
  return c;
}

/* solid off-white wash the roller lays down — deliberately not pure white and not fully
   opaque at the edges, so the old mark ghosts through the way it really does */
function renderWashArt(w,h,seed){
  const c = cv(w,h), x = c.getContext("2d");
  /* Close to the wall rather than white: a bright rectangle reads as a UI panel, whereas a
     patch a shade off the plaster reads as somebody having painted over the old sign. */
  x.fillStyle = "#E4DBC8";
  /* ragged edges — a roller does not leave a crisp box */
  x.beginPath();
  const n = 26, m = Math.min(w,h)*0.055;
  for(let i=0;i<n;i++){
    const t = i/n*4;
    const e = t < 1 ? {x:lerp(0,w,t),      y:0}
            : t < 2 ? {x:w,               y:lerp(0,h,t-1)}
            : t < 3 ? {x:lerp(w,0,t-2),   y:h}
                    : {x:0,               y:lerp(h,0,t-3)};
    const j = (hash(seed+i*3.7)-0.5)*m*2;
    const inward = (e.x===0?1:0) - (e.x===w?1:0);
    const inwardY = (e.y===0?1:0) - (e.y===h?1:0);
    x.lineTo(e.x + inward*j, e.y + inwardY*j);
  }
  x.closePath();
  x.fill();
  /* feather it: a roller edge is soft and slightly overrun, not a cut line */
  if(CAN_FILTER){
    const f = cv(w,h), fx = f.getContext("2d");
    fx.filter = `blur(${Math.max(1, h*0.020)}px)`;
    fx.drawImage(c, 0, 0);
    x.clearRect(0,0,w,h);
    x.drawImage(f, 0, 0);
  }
  x.globalCompositeOperation="multiply";
  x.drawImage(napTexture(w,h,seed*11.3, 0.18), 0, 0);   // a wash is flat, not combed
  x.globalCompositeOperation="destination-in";
  x.drawImage(c,0,0);
  x.globalCompositeOperation="source-over";
  return c;
}

/* ---- neon artwork -------------------------------------------------
   Two renders of the same glyph: the cold glass tube (what the lamp finds) and the lit
   tube with its halo (what the emissive map carries).                                    */
function renderNeonArt(d, w, h, lit){
  const c = cv(w,h), x = c.getContext("2d");
  const L = layoutLogo(x, d, w, h);
  const tubeW = Math.max(1.6, h*0.055);

  const strokeAll = (col, lw, blur, alpha) => {
    x.save();
    x.globalAlpha = alpha;
    x.strokeStyle = col; x.fillStyle = col;
    x.lineWidth = lw; x.lineJoin="round"; x.lineCap="round";
    if(blur > 0){ x.shadowColor = col; x.shadowBlur = blur; }
    /* text as an outline so it reads as bent tube rather than a filled letter */
    x.textBaseline="middle"; x.textAlign="left";
    x.font = `${d.weight} ${L.size}px ${L.fam}`;
    let cx = L.textX;
    for(const ch of d.name){
      x.strokeText(ch, cx, L.textY);
      cx += x.measureText(ch).width + L.track;
    }
    /* the mark, stroked at tube weight */
    x.save();
    x.lineWidth = lw;
    drawMarkAsTube(x, d.mark, L.markX, L.markY, L.markR, col, lw);
    x.restore();
    x.restore();
  };

  if(lit){
    strokeAll(d.neon, tubeW*3.6, h*0.30, 0.26);   // far halo
    strokeAll(d.neon, tubeW*2.0, h*0.14, 0.46);   // near halo
    strokeAll(d.neon, tubeW*1.0, h*0.05, 1.00);   // the tube
    /* a thin, restrained core: a fat white one bleaches the tint straight out of the sign */
    strokeAll("#FFFFFF", tubeW*0.20, 0, 0.42);
  }else{
    strokeAll("#727C8A", tubeW*1.05, 0, 1.0);     // cold glass body
    strokeAll("#A8B4C4", tubeW*0.30, 0, 0.60);    // a highlight down the tube
  }
  return c;
}
/* the marks are filled shapes in paint; as neon they have to be tube outlines */
function drawMarkAsTube(x, kind, cx, cy, r, col, lw){
  x.save(); x.translate(cx,cy);
  x.strokeStyle=col; x.lineWidth=lw; x.lineCap="round"; x.lineJoin="round";
  switch(kind){
    case "chevron":
      x.beginPath(); x.moveTo(-r*0.72,r*0.42); x.lineTo(0,-r*0.52); x.lineTo(r*0.72,r*0.42); x.stroke();
      x.beginPath(); x.moveTo(-r*0.72,r*0.92); x.lineTo(0,0); x.lineTo(r*0.72,r*0.92); x.stroke();
      break;
    case "halfdot":
      x.beginPath(); x.arc(0,0,r*0.74,0,6.2832); x.stroke();
      x.beginPath(); x.moveTo(0,-r*0.74); x.lineTo(0,r*0.74); x.stroke();
      break;
    case "wing":
      x.beginPath(); x.moveTo(-r*0.85,r*0.55);
      x.quadraticCurveTo(-r*0.05,r*0.30, r*0.05,-r*0.80);
      x.quadraticCurveTo(r*0.42,r*0.10, r*0.86,r*0.55); x.stroke();
      break;
    case "fold":
      x.beginPath(); x.moveTo(-r*0.78,-r*0.72); x.lineTo(r*0.34,-r*0.72);
      x.lineTo(r*0.78,-r*0.24); x.lineTo(r*0.78,r*0.78); x.lineTo(-r*0.78,r*0.78);
      x.closePath(); x.stroke();
      break;
    case "bars":
      for(let i=0;i<3;i++){
        const h2=r*(0.42+i*0.42), px=-r*0.62+i*r*0.58;
        x.beginPath(); x.moveTo(px, r*0.80); x.lineTo(px, r*0.80-h2); x.stroke();
      }
      break;
    case "clock":
      x.beginPath(); x.arc(0,0,r*0.78,0,6.2832); x.stroke();
      x.beginPath(); x.moveTo(0,0); x.lineTo(0,-r*0.46); x.moveTo(0,0); x.lineTo(r*0.40,r*0.12); x.stroke();
      break;
    case "ring":
      x.beginPath(); x.arc(0,0,r*0.74,-0.35,4.55); x.stroke();
      x.beginPath(); x.arc(r*0.68,r*0.30,r*0.16,0,6.2832); x.stroke();
      break;
    case "corner":
      x.beginPath(); x.moveTo(-r*0.80,-r*0.80); x.lineTo(r*0.80,-r*0.80);
      x.lineTo(r*0.80,r*0.10); x.lineTo(-r*0.10,r*0.80); x.lineTo(-r*0.80,r*0.80);
      x.closePath(); x.stroke();
      break;
    case "leaf":
      x.beginPath(); x.moveTo(0,r*0.86);
      x.quadraticCurveTo(-r*0.95,r*0.10, 0,-r*0.86);
      x.quadraticCurveTo(r*0.95,r*0.10, 0,r*0.86); x.closePath(); x.stroke();
      break;
    case "wave":
      for(let i=0;i<2;i++){
        const yy=-r*0.28+i*r*0.62;
        x.beginPath(); x.moveTo(-r*0.86,yy);
        x.bezierCurveTo(-r*0.42,yy-r*0.44,-r*0.02,yy+r*0.44,r*0.42,yy);
        x.bezierCurveTo(r*0.62,yy-r*0.22,r*0.74,yy-r*0.16,r*0.86,yy-r*0.12);
        x.stroke();
      }
      break;
  }
  x.restore();
}

/* ---------------------------------------------------------------------
   STROKE PLANS
   One source of truth for both the hand target and the stamping: sample(t) gives a point in
   slot space plus how far off the wall the tool is, so the tool can lift between passes and
   the mask simply stops receiving stamps while it is off the surface.
   --------------------------------------------------------------------- */
/* Where the ink actually is. Sweeping the whole slot box wasted two passes of three on empty
   margin, so nothing appeared until the stroke was 60% done — the opposite of the point. The
   plan is built over the artwork's own bounds instead, so letters start showing immediately. */
function inkBox(c){
  const x = c.getContext("2d");
  const d = x.getImageData(0,0,c.width,c.height).data;
  let u0=c.width, v0=c.height, u1=0, v1=0, any=false;
  for(let y=0;y<c.height;y++){
    for(let px=0;px<c.width;px++){
      if(d[(y*c.width+px)*4+3] > 12){
        any=true;
        if(px<u0)u0=px; if(px>u1)u1=px;
        if(y<v0)v0=y;  if(y>v1)v1=y;
      }
    }
  }
  if(!any) return { u0:0.04, v0:0.04, u1:0.96, v1:0.96 };
  const pad = c.height*0.06;
  return {
    u0: clamp((u0-pad)/c.width, 0, 1), u1: clamp((u1+pad)/c.width, 0, 1),
    v0: clamp((v0-pad)/c.height,0, 1), v1: clamp((v1+pad)/c.height,0, 1),
  };
}

function makePlan(passes, box, lift, seed){
  const pts = [];
  const bu0=box.u0, bu1=box.u1, bv0=box.v0, bv1=box.v1;
  for(let j=0;j<passes;j++){
    const v = bv0 + (bv1-bv0)*((j+0.5)/passes);
    const rev = j % 2 === 1;
    const n = 7;
    for(let k=0;k<=n;k++){
      const t = k/n;
      const u = rev ? 1-t : t;
      /* signwriters do not draw straight lines; a slow wander keeps it human */
      const wob = Math.sin(t*3.1 + j*2.2 + seed)*0.010 + (hash(seed+j*5.3+k*1.9)-0.5)*0.008;
      pts.push({ u: lerp(bu0, bu1, u), v: v + wob, off:0 });
    }
    if(j < passes-1){
      /* lift, travel back across, and come down again */
      const a = pts[pts.length-1];
      const nv = bv0 + (bv1-bv0)*((j+1.5)/passes);
      for(let k=1;k<=4;k++){
        const t=k/5;
        pts.push({ u: a.u, v: lerp(a.v, nv, t), off: Math.sin(Math.PI*t)*lift });
      }
    }
  }
  /* arc-length table */
  const cum=[0];
  for(let i=1;i<pts.length;i++){
    const d = Math.hypot(pts[i].u-pts[i-1].u, pts[i].v-pts[i-1].v) + Math.abs(pts[i].off-pts[i-1].off)*0.5;
    cum.push(cum[i-1]+d);
  }
  const total = cum[cum.length-1] || 1;
  return {
    pts, cum, total,
    sample(t){
      const s = clamp(t,0,1)*total;
      let i = 1;
      while(i < cum.length-1 && cum[i] < s) i++;
      const k = (s - cum[i-1]) / Math.max(1e-6, cum[i]-cum[i-1]);
      const a = pts[i-1], b = pts[i];
      return {
        u: lerp(a.u,b.u,k), v: lerp(a.v,b.v,k), off: lerp(a.off,b.off,k),
        du: b.u-a.u, dv: b.v-a.v,
      };
    },
  };
}

/* ---------------------------------------------------------------------
   SLOT
   --------------------------------------------------------------------- */
const slotGeo = new T3.PlaneGeometry(1,1);
const SLOTS = CREW.SLOTS = [];

function makeSlot(i){
  const s = {
    i, x:0, y:0, w:0, h:0, tier:0,
    cw:0, ch:0,
    flat:null, out:null, work:null,
    art:null, mask:null, maskCtx:null,
    plan:null, layerKind:null, layerData:null,
    dirty:true,
    /* dark theme */
    data:null, next:null, neonOn:null, neonOff:null,
    charge:0, litLevel:0, flick:1, spin:0, spinTo:0,
    pop:0,
  };

  /* light theme: paint straight onto the wall */
  s.paintTex = null;
  s.paintMat = new T3.MeshStandardMaterial({
    transparent:true, roughness:0.55, metalness:0.0, depthWrite:false,
  });
  s.paintMesh = new T3.Mesh(slotGeo, s.paintMat);
  s.paintMesh.renderOrder = 1;
  CREW.scene.add(s.paintMesh);

  /* dark theme: a mounted sign panel that can rotate to the next company */
  s.panel = new T3.Group();
  s.panelBack = new T3.Mesh(new T3.BoxGeometry(1,1,1), new T3.MeshStandardMaterial({
    color:0x1B2029, roughness:0.58, metalness:0.30 }));
  s.panelBack.castShadow = true; s.panelBack.receiveShadow = true;
  s.signMat = new T3.MeshStandardMaterial({
    transparent:true, roughness:0.42, metalness:0.1,
    emissive:0xffffff, emissiveIntensity:0.0, depthWrite:false,
  });
  s.signMesh = new T3.Mesh(slotGeo, s.signMat);
  s.signMesh.renderOrder = 2;
  /* a real light so a lit sign spills onto the wall */
  s.glowLight = new T3.PointLight(0xffffff, 0, 1, 2);
  s.panel.add(s.panelBack, s.signMesh, s.glowLight);
  s.panel.visible = false;
  CREW.scene.add(s.panel);

  /* the socket the plug goes into, bottom-left of the panel */
  s.socket = new T3.Mesh(new T3.BoxGeometry(1,1,1), new T3.MeshStandardMaterial({
    color:0x2A2F36, roughness:0.6, metalness:0.4 }));
  s.panel.add(s.socket);

  return s;
}

/* recreate the canvases at the current slot size */
function sizeSlot(s){
  const dpr = Math.min(devicePixelRatio||1, 2) * 1.15;
  s.w = S.slotW; s.h = S.slotH;
  s.cw = Math.round(s.w*dpr); s.ch = Math.round(s.h*dpr);
  s.flat = cv(s.cw,s.ch);
  s.out  = cv(s.cw,s.ch);
  s.work = cv(s.cw,s.ch);
  s.mask = cv(s.cw,s.ch);
  s.maskCtx = s.mask.getContext("2d");
  s.art  = null;

  if(s.paintTex) s.paintTex.dispose();
  s.paintTex = new T3.CanvasTexture(s.out);
  s.paintTex.colorSpace = T3.SRGBColorSpace;
  s.paintTex.anisotropy = CREW.renderer.capabilities.getMaxAnisotropy();
  s.paintMat.map = s.paintTex;
  s.paintMat.needsUpdate = true;

  /* neon pair */
  s.neonOffC = cv(s.cw,s.ch);
  s.neonOnC  = cv(s.cw,s.ch);
  s.neonMask = cv(s.cw,s.ch);
  s.neonOut  = cv(s.cw,s.ch);
  if(s.signTex)  s.signTex.dispose();
  if(s.emisTex)  s.emisTex.dispose();
  s.signTex = new T3.CanvasTexture(s.neonOffC);
  s.signTex.colorSpace = T3.SRGBColorSpace;
  s.emisTex = new T3.CanvasTexture(s.neonOut);
  s.emisTex.colorSpace = T3.SRGBColorSpace;
  s.signMat.map = s.signTex;
  s.signMat.emissiveMap = s.emisTex;
  s.signMat.needsUpdate = true;
}

/* place a slot's meshes for the current layout */
function placeSlot(s, def){
  s.x = def.x; s.y = def.y; s.tier = def.tier;
  const C = CFG.layout;
  /* w/h are apparent px; at depth they have to be scaled by the perspective factor so the
     logo still measures S.slotW on screen */
  const kp = CREW.kAt(C.slotZ), kn = CREW.kAt(C.panelZ);
  s.wW = s.w*kp; s.hW = s.h*kp;
  s.wN = s.w*kn; s.hN = s.h*kn;

  s.paintMesh.scale.set(s.wW, s.hW, 1);
  s.paintMesh.position.set(CREW.wx(s.x, C.slotZ), CREW.wy(s.y, C.slotZ), C.slotZ);

  s.panel.position.set(CREW.wx(s.x, C.panelZ), CREW.wy(s.y, C.panelZ), C.panelZ);
  s.panelBack.scale.set(s.wN*1.08, s.hN*1.13, 10);
  s.panelBack.position.set(0,0,-6);
  s.signMesh.scale.set(s.wN, s.hN, 1);
  s.signMesh.position.set(0,0,0.6);
  s.glowLight.position.set(0,0,26);
  s.glowLight.distance = Math.max(s.wN, s.hN)*3.4;
  s.glowLight.decay = 2;
  s.socket.scale.set(s.hN*0.10, s.hN*0.10, 9);
  s.socket.position.set(-s.wN*0.50, -s.hN*0.62, -2);
  /* socket in slot-uv, for the charge front and for aiming the plug */
  s.socketU = 0.0; s.socketV = 1.06;
}

/* a point on a slot's face, in world.
   u,v are 0..1 across the artwork (v runs DOWN, like the canvas);
   off lifts the tool off the surface, in stature units.                                   */
CREW.slotPointW = function(s, u, v, off, out){
  const dark = CREW.themeMix() > 0.5;
  const z = dark ? CFG.layout.panelZ + 1.2 : CFG.layout.slotZ;
  const w = dark ? s.wN : s.wW, h = dark ? s.hN : s.hW;
  const cx = CREW.wx(s.x, z), cy = CREW.wy(s.y, z);
  let px = cx + (u-0.5)*w, py = cy + (0.5-v)*h;
  /* the panel can be part-way through a rotation; follow its face */
  if(dark && s.spin){
    const c = Math.cos(s.spin), sn = Math.sin(s.spin);
    const dx = (u-0.5)*w;
    px = cx + dx*c;
    return (out||new T3.Vector3()).set(px, py, z + dx*(-sn) + (off||0)*S.stature*0.16);
  }
  return (out||new T3.Vector3()).set(px, py, z + (off||0)*S.stature*0.16);
};

CREW.buildSlots = function(){
  while(SLOTS.length < S.perPass) SLOTS.push(makeSlot(SLOTS.length));
  for(let i=0;i<SLOTS.length;i++){
    const on = i < S.perPass;
    SLOTS[i].paintMesh.visible = false;
    SLOTS[i].panel.visible = false;
    SLOTS[i].active = on;
    if(!on) continue;
    sizeSlot(SLOTS[i]);
    placeSlot(SLOTS[i], S.slots[i]);
  }
};

/* ---------------------------------------------------------------------
   LIGHT THEME: layers
   --------------------------------------------------------------------- */
CREW.slotReset = function(s){
  clear(s.flat); clear(s.out); clear(s.mask); clear(s.work);
  s.art = null; s.layerKind = null; s.plan = null; s.dirty = true;
  s.charge = 0; s.litLevel = 0; s.flick = 1; s.spin = 0; s.spinTo = 0; s.pop = 0;
  s.drips = [];
};

/* start a new coat. kind: "logo" | "wash" */
CREW.slotBeginLayer = function(s, kind, data){
  /* whatever was on the wall is now permanent */
  CREW.slotFlatten(s);
  s.layerKind = kind;
  s.layerData = data || null;
  s.art = kind === "wash"
    ? renderWashArt(s.cw, s.ch, s.i*7.1 + 3)
    : renderPaintArt(data, s.cw, s.ch, s.i*13.7 + (data ? data.name.length : 0));
  clear(s.mask);
  s.dirty = true;
  if(kind === "wash"){
    /* the wash has to cover the whole panel, ink or no ink */
    s.ink = { u0:0.015, u1:0.985, v0:0.03, v1:0.97 };
    s.plan = makePlan(2, s.ink, 0.55, s.i*2.1);
    s.band = s.ch*0.62;
  }else{
    s.ink = inkBox(s.art);
    const n = CFG.paint.passes;
    s.plan = makePlan(n, s.ink, 0.62, s.i*3.9 + 1.3);
    /* the footprint is a band of the INK height, overlapping its neighbours by a third */
    s.band = Math.max(6, (s.ink.v1-s.ink.v0)*s.ch/n*1.34);
  }
  s.drips = s.drips || [];
};
CREW.slotFlatten = function(s){
  if(!s.art) return;
  const fx = s.flat.getContext("2d");
  const wx = s.work.getContext("2d");
  wx.clearRect(0,0,s.cw,s.ch);
  wx.drawImage(s.art,0,0);
  wx.globalCompositeOperation="destination-in";
  wx.drawImage(s.mask,0,0);
  wx.globalCompositeOperation="source-over";
  fx.drawImage(s.work,0,0);
  s.art=null; clear(s.mask); s.dirty=true;
};

/* ---- stamping -----------------------------------------------------
   The footprint is drawn at the tool's own position each frame. Brush: a flat ferrule with
   individual bristle lines, so the leading edge is combed rather than round. Roller: a wide
   band with lighter edges where the nap runs out of paint.                                */
function stampCommon(s, cb){
  const x = s.maskCtx;
  x.save(); cb(x); x.restore();
  s.dirty = true;
}
CREW.stampBrush = function(s, u, v, ang, wScale, seed){
  const w = (s.band || s.ch*CFG.paint.brushW) * (wScale||1);
  const bite = w * CFG.paint.brushBite;
  stampCommon(s, x => {
    x.translate(u*s.cw, v*s.ch);
    x.rotate(ang||0);
    x.globalCompositeOperation = "source-over";
    /* body of the stroke */
    const g = x.createLinearGradient(0,-w/2,0,w/2);
    g.addColorStop(0,   "rgba(255,255,255,0.55)");
    g.addColorStop(0.14,"rgba(255,255,255,1)");
    g.addColorStop(0.86,"rgba(255,255,255,1)");
    g.addColorStop(1,   "rgba(255,255,255,0.55)");
    x.fillStyle = g;
    x.fillRect(-bite/2, -w/2, bite, w);
    /* bristles: a comb of short lines that overshoot the body */
    x.strokeStyle = "rgba(255,255,255,0.85)";
    x.lineCap="round";
    const n = 9;
    for(let i=0;i<n;i++){
      const yy = -w/2 + (i+0.5)*(w/n) + (hash(seed+i*3.1)-0.5)*w*0.05;
      const over = bite*(0.10 + hash(seed+i*5.7)*0.42);
      x.lineWidth = w/n*(0.42+hash(seed+i*9.1)*0.4);
      x.globalAlpha = 0.35 + hash(seed+i*11.3)*0.5;
      x.beginPath(); x.moveTo(-bite/2-over*0.4, yy); x.lineTo(bite/2+over, yy); x.stroke();
    }
  });
};
CREW.stampRoller = function(s, u, v, ang, seed){
  const w = s.ch * 0.62;      // roller length
  const bite = s.ch * 0.20;
  stampCommon(s, x => {
    x.translate(u*s.cw, v*s.ch);
    x.rotate(ang||0);
    const g = x.createLinearGradient(0,-w/2,0,w/2);
    g.addColorStop(0,   "rgba(255,255,255,0.35)");
    g.addColorStop(0.10,"rgba(255,255,255,0.98)");
    g.addColorStop(0.90,"rgba(255,255,255,0.98)");
    g.addColorStop(1,   "rgba(255,255,255,0.35)");
    x.fillStyle=g;
    x.fillRect(-bite/2,-w/2,bite,w);
    /* nap streaks along the travel direction */
    x.strokeStyle="rgba(255,255,255,0.5)";
    for(let i=0;i<12;i++){
      const yy=-w/2+(i+0.5)*(w/12);
      x.globalAlpha=0.04+hash(seed+i*7.3)*0.08;
      x.lineWidth=w/12*0.55;
      x.beginPath(); x.moveTo(-bite*0.75,yy); x.lineTo(bite*0.75,yy); x.stroke();
    }
  });
};
/* a run of wet paint that creeps down and stops */
CREW.slotDrip = function(s, u, v, seed){
  s.drips.push({ u, v, len:0, max: 0.10+hash(seed)*0.34, w: 0.020+hash(seed*3.1)*0.022,
                 sp: 0.30+hash(seed*7.7)*0.5, seed });
};
function stepDrips(s, dt){
  if(!s.drips || !s.drips.length) return;
  for(const d of s.drips){
    if(d.len >= d.max) continue;
    d.len = Math.min(d.max, d.len + d.sp*dt*(1 - d.len/d.max*0.8));
    const x = s.maskCtx;
    x.save();
    const w = d.w*s.ch*(1 - d.len/d.max*0.45);
    x.fillStyle="rgba(255,255,255,0.95)";
    x.beginPath();
    x.moveTo(d.u*s.cw - w/2, d.v*s.ch);
    x.lineTo(d.u*s.cw + w/2, d.v*s.ch);
    x.lineTo(d.u*s.cw + w*0.30, (d.v+d.len)*s.ch);
    x.lineTo(d.u*s.cw - w*0.30, (d.v+d.len)*s.ch);
    x.closePath(); x.fill();
    /* the bead at the bottom of the run */
    x.beginPath();
    x.ellipse(d.u*s.cw, (d.v+d.len)*s.ch, w*0.42, w*0.60, 0, 0, 6.2832);
    x.fill();
    x.restore();
    s.dirty = true;
  }
}

/* ---------------------------------------------------------------------
   DARK THEME: the sign, and the charge crawling out of the socket
   --------------------------------------------------------------------- */
CREW.slotSetSign = function(s, data){
  s.data = data;
  s.neonOffC.getContext("2d").clearRect(0,0,s.cw,s.ch);
  s.neonOffC.getContext("2d").drawImage(renderNeonArt(data, s.cw, s.ch, false),0,0);
  s.neonOnC .getContext("2d").clearRect(0,0,s.cw,s.ch);
  s.neonOnC .getContext("2d").drawImage(renderNeonArt(data, s.cw, s.ch, true),0,0);
  clear(s.neonMask);
  s.charge = 0;
  s.signTex.needsUpdate = true;
  s.dirty = true;
  s.glowLight.color.set(data.neon);
};
/* r is in slot-height units, measured from the socket */
CREW.slotSetCharge = function(s, r){
  if(r <= s.charge) return;
  s.charge = r;
  const x = s.neonMask.getContext("2d");
  const cx = s.socketU*s.cw, cy = s.socketV*s.ch;
  const R = r*Math.hypot(s.cw, s.ch)*1.05;
  const g = x.createRadialGradient(cx,cy,Math.max(0,R*0.72), cx,cy,R);
  g.addColorStop(0,"rgba(255,255,255,1)");
  g.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=g;
  x.fillRect(0,0,s.cw,s.ch);
  s.dirty = true;
};
CREW.slotDischarge = function(s){
  clear(s.neonMask); s.charge = 0; s.dirty = true;
};

/* ---------------------------------------------------------------------
   COMPOSITE
   --------------------------------------------------------------------- */
CREW.composeSlot = function(s){
  if(!s.dirty) return;
  s.dirty = false;
  if(S.theme === "light" || CREW.themeMix() < 0.5){
    const x = s.out.getContext("2d");
    x.clearRect(0,0,s.cw,s.ch);
    x.drawImage(s.flat,0,0);
    if(s.art){
      const wx = s.work.getContext("2d");
      wx.clearRect(0,0,s.cw,s.ch);
      wx.drawImage(s.art,0,0);
      wx.globalCompositeOperation="destination-in";
      wx.drawImage(s.mask,0,0);
      wx.globalCompositeOperation="source-over";
      x.drawImage(s.work,0,0);
    }
    s.paintTex.needsUpdate = true;
  }
  /* neon emissive = the lit artwork, cut to however far the charge has travelled */
  const nx = s.neonOut.getContext("2d");
  nx.clearRect(0,0,s.cw,s.ch);
  if(s.charge > 0){
    nx.drawImage(s.neonOnC,0,0);
    nx.globalCompositeOperation="destination-in";
    nx.drawImage(s.neonMask,0,0);
    nx.globalCompositeOperation="source-over";
  }
  s.emisTex.needsUpdate = true;
};

CREW.stepSlots = function(dt){
  const dark = CREW.themeMix() > 0.5;
  let humLevel = 0;
  for(const s of SLOTS){
    if(!s.active) continue;
    stepDrips(s, dt);

    /* the little punch when a logo lands */
    if(s.pop > 0){
      s.pop = Math.max(0, s.pop - dt*4.2);
      const k = Math.sin(Math.PI*(1-s.pop))*0.045*s.pop;
      s.paintMesh.scale.set(s.w*(1+k), s.h*(1+k), 1);
      s.panel.scale.set(1+k*0.5, 1+k*0.5, 1);
    }

    /* neon: settle to the target brightness, with mains wobble and a flicker envelope */
    if(dark){
      const hum = 1 + Math.sin(CREW.T*37.1 + s.i*2.3)*CFG.neon.hum
                    + Math.sin(CREW.T*11.7 + s.i)*CFG.neon.hum*0.4;
      const lvl = s.litLevel * s.flick * hum;
      s.signMat.emissiveIntensity = lvl*2.35;
      s.glowLight.intensity = lvl * Math.max(s.w,s.h) * 2.2;
      humLevel = Math.max(humLevel, s.litLevel);
      /* panel rotation when it swaps to the next company */
      if(Math.abs(s.spin - s.spinTo) > 1e-4){
        s.spin = CREW.approach(s.spin, s.spinTo, 0.0009, dt);
        if(Math.abs(s.spin - s.spinTo) < 0.004) s.spin = s.spinTo;
        s.panel.rotation.y = s.spin;
      }
    }
    CREW.composeSlot(s);
  }
  if(dark) CREW.setHum(humLevel); else CREW.setHum(0);
};

/* theme visibility */
CREW.slotsApplyTheme = function(dark){
  for(const s of SLOTS){
    if(!s.active) continue;
    s.paintMesh.visible = !dark;
    s.panel.visible = dark;
  }
};

CREW.makePlan = makePlan;
CREW.inkBox = inkBox;
CREW.renderPaintArt = renderPaintArt;
})();
