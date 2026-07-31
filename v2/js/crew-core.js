/* =====================================================================
   LOGO CREW — core
   Scene, camera, lights, the wall, layout, particles, procedural audio.

   Scene units are stage pixels. A point at CSS pixel (px,py) on the z=0 plane maps to
   (px - W/2, -(py - H/2), 0) and the camera is pushed back so that plane is exactly 1:1.
   Everything in this project is authored in screen px and y is screen-DOWN, so it goes
   through vx()/vy() on the way into three.
   ===================================================================== */
(function(){
"use strict";

const CREW = window.CREW = window.CREW || {};

/* =====================================================================
   TUNABLES
   ===================================================================== */
const CFG = CREW.CFG = {
  layout:{
    groundY   : 0.930,   // of stage height
    stature   : 0.460,   // how tall the character stands, of stage height
    slotW     : 0.118,   // of stage width
    slotGap   : 0.045,
    slotAspect: 0.46,    // slot height / slot width
    /* One row, deliberately above standing reach. reachTop() below is the highest point he
       can touch flat-footed once the brush is counted; the row is set above it, which is
       what makes the stepladder load-bearing rather than a prop he happens to hold. */
    /* rowY is DERIVED, not set — see layout(). */
    headroom  : 0.05,    // gap between the top of his head on the ladder and the row, of stature
    /* Depth costs reach: every px between him and the wall comes off the horizontal budget
       for the far top corner of a slot. So the whole z stack is a fraction of HIS height, not
       a pixel constant — held constant, a 40px gap that is nothing to a 260px character eats
       most of the reach of a 140px one, and the phone layout silently became unpaintable.
       layout() writes charZ/wallZ/slotZ/panelZ from these each time it runs. */
    zChar     :  0.055,  // character plane, in front of the wall, of stature
    zWall     : -0.140,
    zSlot     : -0.101,  // painted straight onto the wall
    zPanel    : -0.050,  // dark theme: signs are mounted, so they stand proud of it
    charZ     : 14, wallZ : -36, slotZ : -26, panelZ : -12,   // derived; see layout()
  },
  walk:{
    speed      : 0.62,   // stage widths per second at pace 1.0
    strideOf   : 0.44,   // stride length as a fraction of stature
    swing      : 0.42,   // fraction of the gait cycle a foot is in the air
    lift       : 0.085,  // foot lift, of stature
    bob        : 0.028,  // hip bob, of stature
    sway       : 0.020,  // lateral hip sway, of stature
    lean       : 0.10,   // forward lean at full speed, radians
  },
  ladder:{
    /* v2: he works from the DECK, not from a tread part way up — see makeLadder(). deckH is
       STEP_TOP in crew-props.js, and the logo row height is derived from it. */
    deckH      : 0.400,  // height of the deck he stands on, of stature
    offsetX    : 0.00,   // where it is planted relative to the slot centre, of slot width
    setDown    : 0.030,  // how far it is lifted while being repositioned, of stature
  },
  paint:{
    brushW     : 0.30,   // fallback footprint width, of slot height
    brushBite  : 0.42,   // footprint depth as a fraction of its width (a flat fitch)
    passes     : 3,      // horizontal sweeps to cover a slot
    dripChance : 0.55,
    splatter   : 7,      // flecks thrown per sweep
  },
  neon:{
    crawl   : 0.55,      // seconds for the charge to fill a sign
    hum     : 0.035,     // idle brightness wobble
    sparks  : 26,
  },
  audio:{ master:0.55 },
  pace: 1.0,
};

/* =====================================================================
   CONTENT — ten fictional clients.
   mark: which glyph gets drawn to the left of the wordmark.
   tint: the colour that goes in the kettle for that logo / the neon tube colour.
   ===================================================================== */
CREW.DATA = [
  { name:"NORTHWIND", mark:"chevron",  tint:"#2F4858", neon:"#66E0FF", weight:700, track:0.10 },
  { name:"Halftone",  mark:"halfdot",  tint:"#B4472C", neon:"#FF8A5B", weight:600, track:0.00 },
  { name:"KESTREL",   mark:"wing",     tint:"#3D5A3A", neon:"#8CF08A", weight:640, track:0.14 },
  { name:"Fold",      mark:"fold",     tint:"#7A4B86", neon:"#D89BFF", weight:620, track:-0.01 },
  { name:"SLATE&CO",  mark:"bars",     tint:"#1F2933", neon:"#9FD8FF", weight:700, track:0.08 },
  { name:"Meanwhile", mark:"clock",    tint:"#8A5A22", neon:"#FFC46B", weight:560, track:0.00 },
  { name:"ATLAS RUN", mark:"ring",     tint:"#274060", neon:"#7FB8FF", weight:680, track:0.10 },
  { name:"Papercut",  mark:"corner",   tint:"#A33B4E", neon:"#FF7D96", weight:600, track:0.00 },
  { name:"VERDANT",   mark:"leaf",     tint:"#2E6141", neon:"#6FEFB0", weight:660, track:0.12 },
  { name:"Lowtide",   mark:"wave",     tint:"#35606B", neon:"#71E4E8", weight:580, track:0.00 },
];

/* =====================================================================
   MATH
   ===================================================================== */
const clamp = CREW.clamp = (v,a,b) => v<a?a:v>b?b:v;
const lerp  = CREW.lerp  = (a,b,t) => a+(b-a)*t;
const easeIO   = CREW.easeIO   = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
const easeOut  = CREW.easeOut  = t => 1-Math.pow(1-t,3);
const easeIn   = CREW.easeIn   = t => t*t*t;
const easeOutB = CREW.easeOutB = t => { const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); };
const smooth = CREW.smooth = (a,b,t) => { const k = clamp((t-a)/(b-a),0,1); return k*k*(3-2*k); };
/* frame-rate independent exponential approach */
const approach = CREW.approach = (cur,to,rate,dt) => lerp(cur,to,1-Math.pow(rate,dt));

/* deterministic noise so a scrubbed frame always looks the same */
function hash(n){ const s=Math.sin(n*127.1)*43758.5453; return s-Math.floor(s); }
CREW.hash = hash;
CREW.rnd  = (seed) => hash(seed);
CREW.rndRange = (seed,a,b) => a + hash(seed)*(b-a);

CREW.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =====================================================================
   RENDERER / SCENE
   ===================================================================== */
const stage    = CREW.stage    = document.getElementById("stage");
const glCanvas = document.getElementById("gl");

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas:glCanvas, antialias:true, alpha:true,
                                       powerPreference:"high-performance" });
} catch(e){
  document.body.classList.add("no-webgl");
}
CREW.renderer = renderer;
if(!renderer){ CREW.dead = true; return; }

renderer.setClearAlpha(0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene  = CREW.scene  = new THREE.Scene();
const camera = CREW.camera = new THREE.PerspectiveCamera(28, 1, 10, 6000);

/* stage state, filled by layout() */
const S = CREW.S = {
  W:0, H:0, narrow:false, perPass:5,
  groundY:0, stature:0, slotW:0, slotH:0,
  slots:[],            // {x, y, tier}   centre in stage px
  theme:"light",
};

/* Everything in this file is authored as an APPARENT size in CSS px. The z=0 plane is 1:1
   with the screen, so anything pushed back or brought forward has to be scaled by the
   perspective factor at its own depth or it will not line up — which matters here because a
   brush tip at z=+30 has to land exactly on a logo at z=-32. */
let camDist = 1000;
const kAt = CREW.kAt = z => (camDist - z)/camDist;
const vx = CREW.vx = px => px - S.W/2;
const vy = CREW.vy = py => -(py - S.H/2);
CREW.wx = (px, z) => (px - S.W/2) * kAt(z||0);
CREW.wy = (py, z) => -(py - S.H/2) * kAt(z||0);
/* inverse, for putting world things back into px space */
CREW.px = (x, z) => x / kAt(z||0) + S.W/2;
CREW.py = (y, z) => S.H/2 - y / kAt(z||0);

/* =====================================================================
   LIGHTS
   Two rigs live in the same scene; applyTheme() cross-fades their intensities.
   The dark rig is deliberately almost nothing — the work lamp does the work.
   ===================================================================== */
const L = CREW.L = {
  hemi : new THREE.HemisphereLight(0xFFF6E8, 0x8A6E4C, 1.15),
  key  : new THREE.DirectionalLight(0xFFF3E2, 2.10),
  fill : new THREE.DirectionalLight(0xD9E8FF, 0.55),
  rim  : new THREE.DirectionalLight(0xAFC8FF, 0.60),
  amb  : new THREE.AmbientLight(0x223047, 0.0),   // dark theme floor of visibility
};
L.key.castShadow = true;
L.key.shadow.mapSize.set(1536, 1536);
L.key.shadow.bias = -0.0011;
L.key.shadow.normalBias = 2.2;
L.key.shadow.radius = 6;
scene.add(L.hemi, L.key, L.fill, L.rim, L.amb);

const THEME_LIGHT = { hemi:1.15, key:2.10, fill:0.55, rim:0.60, amb:0.00, exposure:1.00 };
/* Dark theme has TWO states. Before he throws the mains the room is essentially black — the
   signs are physically on the wall the whole time, there is simply nothing lighting them.
   After the mains come up there is enough work light to see the wall and the cold glass of
   every sign at once, which is the beat where the audience learns the logos were always
   there. Energising them individually is the payoff on top of that. */
const THEME_DARK  = { hemi:0.028, key:0.024, fill:0.014, rim:0.72, amb:0.038, exposure:1.16 };
const THEME_MAINS = { hemi:0.255, key:0.170, fill:0.090, rim:1.15, amb:0.190, exposure:1.16 };
const themeMix = { t:0 };   // 0 = light, 1 = dark
let mainsLift = 0;          // 0 = black, 1 = work light on

CREW.setMainsLift = function(v){ mainsLift = clamp(v,0,1); };
CREW.mainsLift = () => mainsLift;
CREW.setThemeMix = function(t){
  themeMix.t = t;
  for(const k of ["hemi","key","fill","rim","amb"]){
    const dark = lerp(THEME_DARK[k], THEME_MAINS[k], mainsLift);
    L[k].intensity = lerp(THEME_LIGHT[k], dark, t);
  }
  renderer.toneMappingExposure = lerp(THEME_LIGHT.exposure, THEME_DARK.exposure, t);
  if(CREW.wall){
    CREW.wall.material.color.copy(WALL_LIGHT).lerp(WALL_DARK, t);
    CREW.wall.material.emissiveIntensity = lerp(0, 0.10, t);
  }
  if(CREW.floorMat) CREW.floorMat.color.copy(FLOOR_LIGHT).lerp(FLOOR_DARK, t);
};
CREW.themeMix = () => themeMix.t;

/* =====================================================================
   WALL + FLOOR
   The wall is a real lit surface (not a ShadowMaterial) because in dark theme the whole
   point is that a spot light is the only thing making it visible.
   ===================================================================== */
const WALL_LIGHT  = new THREE.Color(0xE8DEC9);
const WALL_DARK   = new THREE.Color(0x2E333E);
const FLOOR_LIGHT = new THREE.Color(0xCDBDA1);
const FLOOR_DARK  = new THREE.Color(0x1A1D24);

function plasterTexture(w,h){
  const c=document.createElement("canvas");
  c.width=Math.max(2,Math.round(w)); c.height=Math.max(2,Math.round(h));
  const x=c.getContext("2d");
  x.fillStyle="#ffffff"; x.fillRect(0,0,c.width,c.height);
  /* trowel mottle: a few hundred soft blotches, then fine grain */
  /* every blob is drawn nine times, once per wrap offset, so the tile has no seam — a
     visible repeat line down a flat wall is the first thing that gives a texture away */
  for(let i=0;i<900;i++){
    const px=hash(i*3.1)*c.width, py=hash(i*7.7)*c.height;
    const r=6+hash(i*2.3)*30;
    const a=0.020+hash(i*5.5)*0.055;
    const dark = hash(i*11.3) > 0.5;
    for(let ox=-1;ox<=1;ox++) for(let oy=-1;oy<=1;oy++){
      const cx=px+ox*c.width, cy=py+oy*c.height;
      if(cx<-r||cy<-r||cx>c.width+r||cy>c.height+r) continue;
      const g=x.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0, dark?`rgba(0,0,0,${a})`:`rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle=g; x.beginPath(); x.arc(cx,cy,r,0,7); x.fill();
    }
  }
  const img=x.getImageData(0,0,c.width,c.height), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const n=(hash(i*0.017)-0.5)*13;
    d[i]+=n; d[i+1]+=n; d[i+2]+=n;
  }
  x.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  return t;
}

const wallGeo = new THREE.PlaneGeometry(1,1);
const wall = CREW.wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
  color:WALL_LIGHT.clone(), roughness:0.94, metalness:0.0,
  emissive:0x0A0C12, emissiveIntensity:0,
}));
wall.receiveShadow = true;
scene.add(wall);

const floorMat = CREW.floorMat = new THREE.MeshStandardMaterial({
  color:FLOOR_LIGHT.clone(), roughness:0.97, metalness:0.0,
});
const floor = CREW.floor = new THREE.Mesh(new THREE.PlaneGeometry(1,1), floorMat);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);

/* skirting board, so the wall/floor join is not a bare seam */
const skirt = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),
  new THREE.MeshStandardMaterial({ color:0xD8CBB2, roughness:0.7 }));
skirt.castShadow = skirt.receiveShadow = true;
scene.add(skirt);
CREW.skirt = skirt;

/* =====================================================================
   LAYOUT
   ===================================================================== */
CREW.layout = function(){
  const w = stage.clientWidth, h = stage.clientHeight;
  if(w < 140 || h < 140) return false;      // hidden tab / zero-width preview pane
  S.W = w; S.H = h;
  S.narrow  = w < 780;
  S.perPass = S.narrow ? 3 : 5;

  const C = CFG.layout;
  S.groundY = h * C.groundY;
  S.stature = h * (S.narrow ? 0.46 : C.stature);

  /* A slot can never be wider than he can sweep, whatever the stage says it wants to be */
  S.slotW = Math.min(w * (S.narrow ? 0.235 : C.slotW), S.stature*0.62);
  S.slotH = S.slotW * C.slotAspect;
  const gap = w * (S.narrow ? 0.055 : C.slotGap);

  /* The row is derived from the working stance, not chosen. Put its bottom edge just above
     where the top of his head gets to once he is standing on the ladder: that clears his
     silhouette off the logo, guarantees the far top corner is inside his reach, and — because
     the ladder is what put him there — automatically places the row out of standing reach,
     which is the whole reason he is carrying one. */
  /* Reach is MEASURED off the rig, not assumed. This skeleton's shoulder-to-wrist is about
     0.27 of its height, not the 0.36 a first guess used, and getting that wrong put the row
     bodily out of his reach while every number still looked plausible. layout() runs once
     before the character has loaded and again after, so the first pass uses a fallback. */
  const arm    = S.armLen || S.stature*0.28;
  const beyond = S.stature*0.272;          // brush tip, measured past where he grips it
  const R      = arm + beyond;             // measured; no optimism about the lean
  const dz     = C.charZ - C.slotZ;
  const halfW  = S.slotW*0.43;             // the stroke plan insets from the slot edge
  S.treadH     = S.stature*CFG.ladder.deckH;   // he works from the deck
  const shoulderH  = S.shoulderY || S.stature*0.82;
  const shoulderPy = S.groundY - S.treadH - shoulderH;
  const span   = Math.sqrt(Math.max(1, R*R - dz*dz - halfW*halfW));
  S.reachTop   = S.groundY - shoulderH - Math.sqrt(Math.max(1, R*R - dz*dz));  // flat-footed
  /* put the top edge of the row exactly at the far corner he can still cover from the
     ladder, then check whether his head clears the bottom edge */
  const rowY = shoulderPy - span + S.slotH*0.5 + 4;
  S.rowY = rowY;
  S.headTopPy  = S.groundY - (S.treadH + S.stature);
  S.headClears = (rowY + S.slotH*0.5) <= S.headTopPy;
  S.topReach = span;
  const total = S.slotW*S.perPass + gap*(S.perPass-1);
  const x0    = (w - total)/2 + S.slotW/2;

  S.slots.length = 0;
  for(let i=0;i<S.perPass;i++){
    S.slots.push({ i, tier:0, x: x0 + i*(S.slotW+gap), y: rowY });
  }

  /* camera: fov chosen so the z=0 plane is 1:1 with CSS px */
  camDist = (h/2) / Math.tan((camera.fov*Math.PI/180)/2);
  S.camDist = camDist;
  camera.aspect = w/h;
  camera.position.set(0, 0, camDist);
  camera.lookAt(0,0,0);
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
  renderer.setSize(w, h, false);

  /* lights framed off the stage box */
  L.key.position.set(-0.50*w, 0.95*h, 700);
  L.key.target.position.set(0, 0, C.wallZ);
  L.key.target.updateMatrixWorld();
  scene.add(L.key.target);
  const sc = L.key.shadow.camera;
  sc.left=-w*0.85; sc.right=w*0.85; sc.top=h*0.95; sc.bottom=-h*0.95; sc.near=120; sc.far=2600;
  sc.updateProjectionMatrix();
  L.fill.position.set(0.95*w, 0.15*h, 520);
  L.rim.position.set(0.20*w, -0.35*h, -520);

  wall.position.set(0, 0, C.wallZ);
  wall.scale.set(w*2.6, h*2.6, 1);
  if(!wall.material.map){
    wall.material.map = plasterTexture(768, 768);
    wall.material.needsUpdate = true;
  }
  wall.material.map.repeat.set(w*2.6/300, h*2.6/300);

  /* the floor meets the wall at the same world height the character's feet run along */
  const groundW = CREW.wy(S.groundY, C.charZ);
  S.groundW = groundW;
  floor.position.set(0, groundW, C.wallZ + 500);
  floor.scale.set(w*2.6, 1000, 1);

  skirt.scale.set(w*2.6, h*0.028, 14);
  skirt.position.set(0, groundW + h*0.014, C.wallZ + 8);

  return true;
};

/* =====================================================================
   PARTICLES
   One pooled buffer for everything that flies: paint flecks, dust puffs, sparks.
   Flecks that hit the wall or the floor leave a decal disc behind (pooled too), which is
   how splatter accumulates without a giant repainted canvas.
   ===================================================================== */
const PMAX = 260;
const P = CREW.P = {
  n:0,
  x:new Float32Array(PMAX), y:new Float32Array(PMAX), z:new Float32Array(PMAX),
  vx:new Float32Array(PMAX), vy:new Float32Array(PMAX), vz:new Float32Array(PMAX),
  life:new Float32Array(PMAX), max:new Float32Array(PMAX), size:new Float32Array(PMAX),
  kind:new Uint8Array(PMAX),           // 0 fleck  1 dust  2 spark
  col:new Float32Array(PMAX*3),
  drag:new Float32Array(PMAX), grav:new Float32Array(PMAX),
};
const KIND = CREW.KIND = { FLECK:0, DUST:1, SPARK:2 };

const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PMAX*3), 3));
pGeo.setAttribute("pcolor",   new THREE.BufferAttribute(new Float32Array(PMAX*3), 3));
pGeo.setAttribute("psize",    new THREE.BufferAttribute(new Float32Array(PMAX), 1));
pGeo.setAttribute("palpha",   new THREE.BufferAttribute(new Float32Array(PMAX), 1));
pGeo.setDrawRange(0,0);

function spriteTex(soft){
  const c=document.createElement("canvas"); c.width=c.height=64;
  const x=c.getContext("2d");
  const g=x.createRadialGradient(32,32,0,32,32,32);
  if(soft){
    g.addColorStop(0,"rgba(255,255,255,0.62)");
    g.addColorStop(0.45,"rgba(255,255,255,0.24)");
    g.addColorStop(1,"rgba(255,255,255,0)");
  }else{
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(0.55,"rgba(255,255,255,0.94)");
    g.addColorStop(0.78,"rgba(255,255,255,0.30)");
    g.addColorStop(1,"rgba(255,255,255,0)");
  }
  x.fillStyle=g; x.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const TEX_HARD = spriteTex(false), TEX_SOFT = spriteTex(true);

/* two draws: opaque-ish flecks/dust, and additive sparks */
function makePoints(tex, additive){
  const m = new THREE.PointsMaterial({
    map:tex, transparent:true, depthWrite:false, sizeAttenuation:true,
    vertexColors:true, size:1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  /* per-point size + alpha: PointsMaterial has neither, so patch the shader */
  m.onBeforeCompile = sh => {
    sh.vertexShader = "attribute float psize;\nattribute float palpha;\nvarying float vA;\n" +
      sh.vertexShader
        .replace("void main() {", "void main() {\n  vA = palpha;")
        .replace("gl_PointSize = size;", "gl_PointSize = size * psize;");
    sh.fragmentShader = "varying float vA;\n" +
      sh.fragmentShader.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity * vA );");
  };
  const p = new THREE.Points(pGeo.clone(), m);
  p.frustumCulled = false;
  return p;
}
const ptsNormal = makePoints(TEX_HARD, false);
const ptsAdd    = makePoints(TEX_SOFT, true);
scene.add(ptsNormal, ptsAdd);
CREW.ptsNormal = ptsNormal; CREW.ptsAdd = ptsAdd;

const _c = new THREE.Color();
CREW.emit = function(o){
  let i = -1;
  for(let k=0;k<PMAX;k++){ if(P.life[k] <= 0){ i=k; break; } }
  if(i < 0) return;
  P.x[i]=o.x; P.y[i]=o.y; P.z[i]=o.z||0;
  P.vx[i]=o.vx||0; P.vy[i]=o.vy||0; P.vz[i]=o.vz||0;
  P.max[i]=P.life[i]=o.life||0.7;
  P.size[i]=o.size||6;
  P.kind[i]=o.kind||0;
  P.drag[i]=o.drag!=null?o.drag:0.06;
  P.grav[i]=o.grav!=null?o.grav:1400;
  _c.set(o.color||"#ffffff");
  P.col[i*3]=_c.r; P.col[i*3+1]=_c.g; P.col[i*3+2]=_c.b;
};

/* decals: small discs that stay where a fleck landed */
const DMAX = 90;
const decalGeo = new THREE.CircleGeometry(0.5, 10);
const decals = [];
for(let i=0;i<DMAX;i++){
  const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
    transparent:true, opacity:0, depthWrite:false, color:0xffffff }));
  m.visible = false; m.renderOrder = 2;
  scene.add(m);
  decals.push({ m, born:-1 });
}
let decalHead = 0;
CREW.decal = function(x,y,z,r,color,onFloor,alpha){
  const d = decals[decalHead]; decalHead = (decalHead+1)%DMAX;
  d.m.visible = true;
  d.m.material.color.set(color);
  d.m.material.opacity = alpha!=null?alpha:0.82;
  d.m.scale.setScalar(r*2);
  d.m.rotation.set(onFloor ? -Math.PI/2 : 0, 0, hash(decalHead*3.7)*6.28);
  d.m.position.set(x, y, z);
  d.born = CREW.T;
};
CREW.clearDecals = function(){
  for(const d of decals){ d.m.visible=false; d.born=-1; }
};

CREW.stepParticles = function(dt){
  const posN = ptsNormal.geometry.attributes, posA = ptsAdd.geometry.attributes;
  let nN=0, nA=0;
  const groundW = S.groundW, wallW = CFG.layout.wallZ;
  for(let i=0;i<PMAX;i++){
    if(P.life[i] <= 0) continue;
    P.life[i] -= dt;
    if(P.life[i] <= 0) continue;
    const dg = Math.pow(1-P.drag[i], dt*60);
    P.vx[i]*=dg; P.vy[i]*=dg; P.vz[i]*=dg;
    P.vy[i] -= P.grav[i]*dt;                   // world y is up here
    P.x[i]+=P.vx[i]*dt; P.y[i]+=P.vy[i]*dt; P.z[i]+=P.vz[i]*dt;

    const k = P.kind[i], age = 1 - P.life[i]/P.max[i];
    /* flecks stick where they land */
    if(k===KIND.FLECK){
      if(P.y[i] <= groundW+1){
        CREW.decal(P.x[i], groundW+1.2, P.z[i], P.size[i]*0.42,
                   _c.setRGB(P.col[i*3],P.col[i*3+1],P.col[i*3+2]).getStyle(), true, 0.55);
        P.life[i]=0; continue;
      }
      if(P.z[i] <= wallW+3){
        CREW.decal(P.x[i], P.y[i], wallW+3.4, P.size[i]*0.38,
                   _c.setRGB(P.col[i*3],P.col[i*3+1],P.col[i*3+2]).getStyle(), false, 0.62);
        P.life[i]=0; continue;
      }
    }
    let a = 1, sz = P.size[i];
    if(k===KIND.DUST){ a = Math.sin(Math.PI*Math.min(1,age*1.15))*0.5; sz = P.size[i]*(0.6+age*1.5); }
    else if(k===KIND.SPARK){ a = Math.pow(1-age, 1.6); sz = P.size[i]*(1-age*0.55); }
    else { a = age>0.86 ? (1-age)/0.14 : 1; }

    const tgt = (k===KIND.SPARK) ? posA : posN;
    const n   = (k===KIND.SPARK) ? nA   : nN;
    tgt.position.array[n*3]  = P.x[i];
    tgt.position.array[n*3+1]= P.y[i];
    tgt.position.array[n*3+2]= P.z[i];
    tgt.pcolor.array[n*3]  = P.col[i*3];
    tgt.pcolor.array[n*3+1]= P.col[i*3+1];
    tgt.pcolor.array[n*3+2]= P.col[i*3+2];
    tgt.psize.array[n]  = sz;
    tgt.palpha.array[n] = a;
    if(k===KIND.SPARK) nA++; else nN++;
  }
  ptsNormal.geometry.setDrawRange(0,nN);
  ptsAdd.geometry.setDrawRange(0,nA);
  for(const at of ["position","pcolor","psize","palpha"]){
    ptsNormal.geometry.attributes[at].needsUpdate = true;
    ptsAdd.geometry.attributes[at].needsUpdate = true;
  }
  /* decals fade in over a beat so they do not pop */
  for(const d of decals){
    if(d.born < 0) continue;
    const t = clamp((CREW.T - d.born)/0.10, 0, 1);
    d.m.scale.setScalar(d.m.scale.x);            // radius already set
    d.m.material.opacity = d.m.material.opacity * 0 + (d.m.material.opacity || 0);
    if(t < 1) d.m.material.opacity = lerp(0, d.m.material.opacity, t);
    else d.born = -2;                            // settled; stop touching it
  }
};
CREW.killParticles = function(){ for(let i=0;i<PMAX;i++) P.life[i]=0; };

/* =====================================================================
   AUDIO
   Everything is synthesised — no files, so the lab runs from file:// with no fetch.
   Starts muted; the browser needs a gesture before the context will run anyway.
   ===================================================================== */
const A = CREW.A = { ctx:null, master:null, on:false, hum:null, humGain:null };

function ac(){
  if(!A.ctx){
    const C = window.AudioContext || window.webkitAudioContext;
    if(!C) return null;
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = CFG.audio.master;
    A.master.connect(A.ctx.destination);
  }
  if(A.ctx.state === "suspended") A.ctx.resume();
  return A.ctx;
}
CREW.audioEnable = function(on){
  A.on = on;
  if(on){ ac(); } else if(A.ctx){ A.ctx.suspend(); }
};

function noiseBuf(dur){
  const ctx=ac(); if(!ctx) return null;
  const n=Math.max(1,Math.floor(ctx.sampleRate*dur));
  const b=ctx.createBuffer(1,n,ctx.sampleRate);
  const d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  return b;
}
/* filtered noise burst — footsteps, dust, brush drag, roller */
function noise(o){
  if(!A.on) return; const ctx=ac(); if(!ctx) return;
  const t=ctx.currentTime + (o.at||0);
  const src=ctx.createBufferSource(); src.buffer=noiseBuf(o.dur||0.2);
  const f=ctx.createBiquadFilter();
  f.type=o.type||"bandpass"; f.frequency.value=o.freq||900; f.Q.value=o.q||1.1;
  const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,o.gain||0.15), t+(o.atk||0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t+(o.dur||0.2));
  if(o.sweep){
    f.frequency.setValueAtTime(o.freq||900, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60,o.sweep), t+(o.dur||0.2));
  }
  src.connect(f); f.connect(g); g.connect(A.master);
  src.start(t); src.stop(t+(o.dur||0.2)+0.02);
}
/* pitched blip — clunks, plugs, sparks */
function tone(o){
  if(!A.on) return; const ctx=ac(); if(!ctx) return;
  const t=ctx.currentTime+(o.at||0);
  const osc=ctx.createOscillator(); osc.type=o.type||"triangle";
  osc.frequency.setValueAtTime(o.f0||300,t);
  if(o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20,o.f1), t+(o.dur||0.18));
  const g=ctx.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002,o.gain||0.12), t+(o.atk||0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t+(o.dur||0.18));
  osc.connect(g); g.connect(A.master);
  osc.start(t); osc.stop(t+(o.dur||0.18)+0.02);
}
CREW.sfx = {
  step(hard){ noise({ freq:180, q:0.8, dur:0.13, gain:hard?0.16:0.10, sweep:70, type:"lowpass" });
              noise({ freq:2400, q:1.4, dur:0.05, gain:hard?0.05:0.03 }); },
  rung(){ tone({ type:"square", f0:520, f1:190, dur:0.10, gain:0.055 });
          noise({ freq:1500, q:1.2, dur:0.07, gain:0.05 }); },
  setDown(){ tone({ type:"sine", f0:150, f1:70, dur:0.22, gain:0.16 });
             noise({ freq:900, q:0.9, dur:0.13, gain:0.07, sweep:200 }); },
  ladder(){ tone({ type:"triangle", f0:300, f1:110, dur:0.28, gain:0.14 });
            noise({ freq:1200, q:0.7, dur:0.20, gain:0.07, sweep:300 }); },
  dip(){ noise({ freq:520, q:1.6, dur:0.26, gain:0.07, sweep:1400 }); },
  brush(dur){ noise({ freq:1700, q:0.55, dur:dur||0.34, gain:0.055, sweep:820, atk:0.05 }); },
  roller(dur){ noise({ freq:600, q:0.5, dur:dur||0.42, gain:0.075, sweep:1500, atk:0.06 }); },
  splat(){ noise({ freq:2600, q:1.0, dur:0.06, gain:0.035 }); },
  plug(){ tone({ type:"square", f0:180, f1:90, dur:0.09, gain:0.10 });
          noise({ freq:3000, q:1.0, dur:0.05, gain:0.06 }); },
  spark(){ noise({ freq:5200, q:0.7, dur:0.10, gain:0.10, sweep:1400 });
           tone({ type:"sawtooth", f0:1400, f1:220, dur:0.07, gain:0.04 }); },
  unplug(){ noise({ freq:2000, q:0.8, dur:0.12, gain:0.07, sweep:400 });
            tone({ type:"square", f0:120, f1:60, dur:0.12, gain:0.07 }); },
  flicker(){ noise({ freq:3400, q:2.4, dur:0.045, gain:0.05 }); },
  ignite(){ noise({ freq:900, q:0.6, dur:0.30, gain:0.06, sweep:5200, atk:0.02 }); },
};
/* the mains hum under the dark theme, level tracking how many signs are lit */
CREW.setHum = function(level){
  if(!A.on){ if(A.humGain) A.humGain.gain.value = 0; return; }
  const ctx=ac(); if(!ctx) return;
  if(!A.hum){
    A.hum = ctx.createOscillator(); A.hum.type="sawtooth"; A.hum.frequency.value=50;
    const lp=ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=160;
    const h2=ctx.createOscillator(); h2.type="sine"; h2.frequency.value=100;
    const h2g=ctx.createGain(); h2g.gain.value=0.35;
    A.humGain = ctx.createGain(); A.humGain.gain.value=0;
    A.hum.connect(lp); lp.connect(A.humGain);
    h2.connect(h2g); h2g.connect(A.humGain);
    A.humGain.connect(A.master);
    A.hum.start(); h2.start();
  }
  A.humGain.gain.setTargetAtTime(clamp(level,0,1)*0.030, ctx.currentTime, 0.25);
};

CREW.T = 0;
})();
