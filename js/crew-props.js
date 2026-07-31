/* =====================================================================
   LOGO CREW — props
   Everything the character carries. All of it is modelled in units of STATURE (1.0 = the
   character's full height) and then scaled once, so the whole kit rescales with the stage
   without a single hard-coded pixel.

   Each prop exposes the local points the rig needs:
     grip      where a hand closes on it
     grip2     the second hand, when it takes two
     tip       the working end (bristles / roller face / plug pins / lamp lens)
   so the IK can aim the TOOL rather than the wrist, which is the difference between a
   character holding a brush and a character waving near a wall.
   ===================================================================== */
(function(){
"use strict";
const CREW = window.CREW;
if(!CREW || CREW.dead) return;
const T3 = THREE;
const { clamp, lerp, hash } = CREW;

/* ---------------------------------------------------------------------
   materials
   --------------------------------------------------------------------- */
const M = CREW.MAT = {
  wood    : new T3.MeshStandardMaterial({ color:0xC49A5E, roughness:0.78 }),
  woodDk  : new T3.MeshStandardMaterial({ color:0x9A7440, roughness:0.82 }),
  steel   : new T3.MeshStandardMaterial({ color:0xB9BFC6, roughness:0.34, metalness:0.85 }),
  steelDk : new T3.MeshStandardMaterial({ color:0x6E757D, roughness:0.45, metalness:0.75 }),
  galv    : new T3.MeshStandardMaterial({ color:0xA8AEB4, roughness:0.52, metalness:0.6 }),
  rubber  : new T3.MeshStandardMaterial({ color:0x24262A, roughness:0.92 }),
  bristle : new T3.MeshStandardMaterial({ color:0xE8D9B4, roughness:0.88 }),
  nap     : new T3.MeshStandardMaterial({ color:0xF0EAD8, roughness:0.97 }),
  paint   : new T3.MeshStandardMaterial({ color:0xC2603C, roughness:0.30, metalness:0.05 }),
  lampBody: new T3.MeshStandardMaterial({ color:0x2E3238, roughness:0.42, metalness:0.55 }),
  lens    : new T3.MeshStandardMaterial({ color:0xFFF4D6, roughness:0.12, metalness:0.0,
                                          emissive:0xFFE9B8, emissiveIntensity:2.4 }),
  cable   : new T3.MeshStandardMaterial({ color:0x33373E, roughness:0.94, metalness:0.0 }),
  hiviz   : new T3.MeshStandardMaterial({ color:0xE9F03A, roughness:0.72,
                                          emissive:0x5A6100, emissiveIntensity:0.25 }),
  helmet  : new T3.MeshStandardMaterial({ color:0xF2C21A, roughness:0.34, metalness:0.05 }),
  cap     : new T3.MeshStandardMaterial({ color:0xF4EFE4, roughness:0.86 }),
  overall : new T3.MeshStandardMaterial({ color:0x9EB8D6, roughness:0.88 }),
};

function box(mat,w,h,d){
  const m=new T3.Mesh(new T3.BoxGeometry(w,h,d),mat);
  m.castShadow=true; m.receiveShadow=true; return m;
}
function cyl(mat,rt,rb,h,seg,open){
  const m=new T3.Mesh(new T3.CylinderGeometry(rt,rb,h,seg||16,1,!!open),mat);
  m.castShadow=true; m.receiveShadow=true; return m;
}
function tor(mat,r,tube,seg,arc){
  const m=new T3.Mesh(new T3.TorusGeometry(r,tube,8,seg||24,arc==null?6.2832:arc),mat);
  m.castShadow=true; return m;
}
const at=(o,x,y,z)=>{ o.position.set(x,y,z); return o; };

/* ---------------------------------------------------------------------
   TUBE — one swept mesh, rebuilt each frame from a centreline. Used for the cable.
   --------------------------------------------------------------------- */
function makeTube(nSeg, nRing, mat){
  const g=new T3.BufferGeometry();
  const verts=nSeg*nRing;
  g.setAttribute("position", new T3.BufferAttribute(new Float32Array(verts*3),3));
  g.setAttribute("normal",   new T3.BufferAttribute(new Float32Array(verts*3),3));
  const idx=[];
  for(let i=0;i<nSeg-1;i++) for(let j=0;j<nRing;j++){
    const a=i*nRing+j, b=i*nRing+(j+1)%nRing, c=(i+1)*nRing+j, d=(i+1)*nRing+(j+1)%nRing;
    idx.push(a,c,b, b,c,d);
  }
  g.setIndex(idx);
  const m=new T3.Mesh(g,mat);
  m.castShadow=true; m.frustumCulled=false;
  m.userData={nSeg,nRing};
  return m;
}
const _tA=new T3.Vector3(), _tB=new T3.Vector3(), _tN=new T3.Vector3(),
      _tBn=new T3.Vector3(), _tUp=new T3.Vector3(0,0,1);
function updateTube(tube, pts, radius){
  const {nSeg,nRing}=tube.userData;
  const pos=tube.geometry.attributes.position.array;
  const nor=tube.geometry.attributes.normal.array;
  for(let i=0;i<nSeg;i++){
    const p=pts[Math.min(i,pts.length-1)];
    const q=pts[Math.min(i+1,pts.length-1)];
    const r=pts[Math.max(0,i-1)];
    _tA.set(q.x-r.x, q.y-r.y, q.z-r.z);
    if(_tA.lengthSq()<1e-9) _tA.set(0,1,0);
    _tA.normalize();
    _tN.copy(_tUp).cross(_tA);
    if(_tN.lengthSq()<1e-8) _tN.set(1,0,0);
    _tN.normalize();
    _tBn.copy(_tA).cross(_tN).normalize();
    for(let j=0;j<nRing;j++){
      const a=j/nRing*6.2832, cs=Math.cos(a), sn=Math.sin(a);
      const nx=_tN.x*cs+_tBn.x*sn, ny=_tN.y*cs+_tBn.y*sn, nz=_tN.z*cs+_tBn.z*sn;
      const k=(i*nRing+j)*3;
      pos[k]=p.x+nx*radius; pos[k+1]=p.y+ny*radius; pos[k+2]=p.z+nz*radius;
      nor[k]=nx; nor[k+1]=ny; nor[k+2]=nz;
    }
  }
  tube.geometry.attributes.position.needsUpdate=true;
  tube.geometry.attributes.normal.needsUpdate=true;
}
CREW.makeTube=makeTube; CREW.updateTube=updateTube;

/* =====================================================================
   STEPLADDER
   A leaning ladder was the first thing built here and it was wrong: the logo row sits about
   one stature-and-a-half off the floor, so a ladder long enough to reach the wall behind it
   is one you would only climb two rungs of. A four-tread A-frame is the thing a painter
   actually carries for this height — it stands on its own, it needs no wall contact, and its
   top platform is where the kettle goes while both hands are busy.

   Origin at the floor, centred between the front stiles. The tread side faces -Z, i.e. the
   wall, so he climbs it facing his work.
   ===================================================================== */
const STEP_TREADS = [0.105, 0.215, 0.325, 0.435, 0.545];
const STEP_TOP = 0.665;
CREW.makeLadder = function(){
  const g=new T3.Group();
  const sw=0.021;                       // stile thickness
  const wBot=0.155, wTop=0.108;         // half-widths, front frame tapers upward
  const zF=-0.020, zBackBot=0.255;      // where the back legs land

  /* front frame */
  for(const sx of [-1,1]){
    const stile=box(M.wood, sw, STEP_TOP*1.02, sw*1.7);
    at(stile, sx*(wBot+wTop)/2, STEP_TOP/2, zF);
    stile.rotation.z = -sx*Math.atan2(wBot-wTop, STEP_TOP);
    g.add(stile);
    const foot=box(M.rubber, sw*1.25, sw*0.75, sw*2.0);
    at(foot, sx*wBot, sw*0.35, zF);
    g.add(foot);
  }
  for(let i=0;i<STEP_TREADS.length;i++){
    const y=STEP_TREADS[i];
    const t=y/STEP_TOP;
    const halfW=lerp(wBot,wTop,t);
    const tread=box(M.woodDk, halfW*2 - sw*0.4, 0.014, 0.072);
    at(tread, 0, y, zF+0.026);
    g.add(tread);
    /* the steel tie under each tread */
    const tie=box(M.steelDk, halfW*2, 0.005, 0.016);
    at(tie, 0, y-0.011, zF+0.004);
    g.add(tie);
    /* worn paint on the treads, because this ladder has been used */
    const drop=box(new T3.MeshStandardMaterial({ color:0xB9563A, roughness:0.45 }),
                   0.030+hash(i*3.1)*0.03, 0.003, 0.030);
    at(drop, (hash(i*7.3)-0.5)*halfW*1.4, y+0.009, zF+0.026+(hash(i*5.7)-0.5)*0.03);
    g.add(drop);
  }
  /* top platform — the paint shelf */
  const shelf=box(M.wood, wTop*2+sw, 0.019, 0.110);
  at(shelf, 0, STEP_TOP, zF+0.030);
  g.add(shelf);
  const lip=box(M.steelDk, wTop*2+sw, 0.016, 0.006);
  at(lip, 0, STEP_TOP+0.016, zF+0.084);
  g.add(lip);

  /* back legs, splayed */
  for(const sx of [-1,1]){
    const len=Math.hypot(STEP_TOP-0.01, zBackBot-zF-0.03);
    const leg=box(M.wood, sw*0.85, len, sw*1.4);
    at(leg, sx*(wBot*0.92+wTop*0.92)/2, (STEP_TOP-0.01)/2, (zF+0.03+zBackBot)/2);
    leg.rotation.x = -Math.atan2(zBackBot-zF-0.03, STEP_TOP-0.01);
    leg.rotation.z = -sx*Math.atan2(wBot*0.92-wTop*0.92, STEP_TOP);
    g.add(leg);
    const foot=box(M.rubber, sw*1.1, sw*0.7, sw*1.8);
    at(foot, sx*wBot*0.92, sw*0.32, zBackBot);
    g.add(foot);
  }
  /* spreader arms, so the A cannot close */
  for(const sx of [-1,1]){
    const arm=box(M.steel, 0.006, 0.006, 0.150);
    at(arm, sx*0.112, 0.360, zF+0.086);
    arm.rotation.x = 0.42;
    g.add(arm);
  }

  g.userData = {
    top:STEP_TOP, treads:STEP_TREADS, nTread:STEP_TREADS.length,
    treadY: i => STEP_TREADS[clamp(Math.round(i),0,STEP_TREADS.length-1)],
    treadZ: zF+0.026,
    halfWAt: y => lerp(wBot, wTop, clamp(y/STEP_TOP,0,1)),
    shelf: new T3.Vector3(0, STEP_TOP+0.010, zF+0.030),
    /* the hand takes it by the top platform when it is carried at his side */
    grip: new T3.Vector3(0, STEP_TOP+0.026, zF+0.030),
    tip:  new T3.Vector3(0, 0, zF+0.030),
  };
  return g;
};

/* =====================================================================
   PAINT KETTLE
   Origin at the base. The paint surface is its own disc so it can tilt as the kettle swings
   and drop as the brush takes paint out of it.
   ===================================================================== */
CREW.makeKettle = function(){
  const g=new T3.Group();
  const rTop=0.062, rBot=0.050, h=0.082;
  const body=cyl(M.galv, rTop, rBot, h, 22, true);
  body.material=new T3.MeshStandardMaterial({ color:0xA8AEB4, roughness:0.52, metalness:0.6,
                                              side:T3.DoubleSide });
  at(body,0,h/2,0);
  g.add(body);
  const base=cyl(M.galv, rBot, rBot, 0.006, 22);
  at(base,0,0.003,0); g.add(base);
  const rim=tor(M.steel, rTop, 0.005, 22);
  rim.rotation.x=Math.PI/2; at(rim,0,h,0); g.add(rim);

  /* wire bail handle, pivoting at the rim */
  const bail=new T3.Group();
  const arc=tor(M.steel, rTop*0.98, 0.0045, 20, Math.PI);
  arc.rotation.set(0,0,0);
  bail.add(arc);
  at(bail,0,h,0);
  g.add(bail);

  /* the paint itself */
  const paintMat=new T3.MeshStandardMaterial({ color:0xC2603C, roughness:0.22, metalness:0.02 });
  const surf=new T3.Mesh(new T3.CircleGeometry(rTop*0.93, 24), paintMat);
  surf.rotation.x=-Math.PI/2;
  at(surf,0,h*0.72,0);
  g.add(surf);

  /* dried runs down the outside */
  for(let i=0;i<5;i++){
    const a=hash(i*3.7)*6.2832;
    const run=box(paintMat, 0.006, h*(0.25+hash(i*5.1)*0.4), 0.004);
    const rr=rTop*0.99;
    at(run, Math.cos(a)*rr, h*0.72-h*(0.12+hash(i*5.1)*0.2), Math.sin(a)*rr);
    g.add(run);
  }

  g.userData={ h, rTop, bail, surf, paintMat,
               grip:new T3.Vector3(0, h+rTop*0.96, 0),
               dip :new T3.Vector3(0, h*0.72, 0) };
  return g;
};

/* =====================================================================
   BRUSH  — origin at the butt, working axis +Y, tip at userData.tip
   ===================================================================== */
CREW.makeBrush = function(){
  const g=new T3.Group();
  const hl=0.260, fl=0.034, bl=0.056, w=0.052;
  /* handle: flat, waisted, like a real signwriter's */
  const handle=box(M.wood, w*0.42, hl, w*0.20);
  at(handle,0,hl/2,0); g.add(handle);
  const swell=cyl(M.wood, w*0.16, w*0.13, hl*0.34, 12);
  at(swell,0,hl*0.26,0); g.add(swell);
  const ferrule=box(M.steel, w*0.86, fl, w*0.24);
  at(ferrule,0,hl+fl/2,0); g.add(ferrule);
  const band=box(M.steelDk, w*0.90, fl*0.16, w*0.27);
  at(band,0,hl+fl*0.30,0); g.add(band);
  /* bristles: a slab plus a few strays, and a tip that carries the paint colour */
  const bri=box(M.bristle, w*0.80, bl, w*0.20);
  at(bri,0,hl+fl+bl/2,0); g.add(bri);
  const tipMat=new T3.MeshStandardMaterial({ color:0xC2603C, roughness:0.26 });
  const wet=box(tipMat, w*0.82, bl*0.52, w*0.22);
  at(wet,0,hl+fl+bl*0.74,0); g.add(wet);
  for(let i=0;i<6;i++){
    const s=box(M.bristle, w*0.03, bl*(0.5+hash(i*7.3)*0.7), w*0.03);
    at(s, (hash(i*3.1)-0.5)*w*0.86, hl+fl+bl*0.6, (hash(i*5.7)-0.5)*w*0.20);
    s.rotation.z=(hash(i*9.1)-0.5)*0.35;
    g.add(s);
  }
  g.userData={ len:hl+fl+bl, tipMat,
               grip:new T3.Vector3(0, hl*0.30, 0),
               tip :new T3.Vector3(0, hl+fl+bl*1.02, 0) };
  return g;
};

/* =====================================================================
   ROLLER — origin at the butt of the pole, roller head crossways at the far end
   ===================================================================== */
CREW.makeRoller = function(){
  const g=new T3.Group();
  const pl=0.250, rr=0.026, rl=0.105;
  const pole=cyl(M.wood, 0.011, 0.013, pl, 12);
  at(pole,0,pl/2,0); g.add(pole);
  const grip=cyl(M.rubber, 0.016, 0.016, pl*0.34, 12);
  at(grip,0,pl*0.20,0); g.add(grip);
  /* the crank: up, across, and back along the roller axis */
  const armA=cyl(M.steel,0.006,0.006,0.038,10);
  at(armA,0,pl+0.019,0); g.add(armA);
  const armB=cyl(M.steel,0.006,0.006,0.052,10);
  armB.rotation.z=Math.PI/2;
  at(armB,0.026,pl+0.038,0); g.add(armB);
  /* head */
  const head=new T3.Group();
  const core=cyl(M.steelDk,0.010,0.010,rl*1.06,12);
  core.rotation.z=Math.PI/2; head.add(core);
  const sleeve=cyl(M.nap, rr, rr, rl, 20);
  sleeve.rotation.z=Math.PI/2; head.add(sleeve);
  const capA=cyl(M.steel,0.011,0.011,0.006,10); capA.rotation.z=Math.PI/2; at(capA,rl/2+0.004,0,0); head.add(capA);
  const capB=capA.clone(); at(capB,-rl/2-0.004,0,0); head.add(capB);
  at(head,0.052,pl+0.038,0);
  g.add(head);
  g.userData={ len:pl, head, sleeve, rr, rl,
               grip :new T3.Vector3(0, pl*0.20, 0),
               grip2:new T3.Vector3(0, pl*0.62, 0),
               tip  :new T3.Vector3(0.052, pl+0.038, 0) };
  return g;
};

/* =====================================================================
   WORK LAMP
   A real SpotLight plus the shaft you can see it through. The shell cones are additive and
   depth-write off, so they read as light in air rather than as geometry.
   ===================================================================== */
const beamVert = `
  varying float vT;
  varying vec3 vN;
  varying vec3 vV;
  void main(){
    vT = clamp((0.5 - position.y / uHeight), 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const beamFrag = `
  varying float vT;
  varying vec3 vN;
  varying vec3 vV;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main(){
    /* brightest along the silhouette, which is what a cone of lit dust actually looks like */
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float fall = pow(1.0 - vT, 1.15);
    float a = fall * (0.16 + 0.84*pow(rim, 1.7)) * uIntensity;
    gl_FragColor = vec4(uColor * (0.55 + 0.75*fall), a);
  }`;

CREW.makeLamp = function(){
  const g=new T3.Group();
  const bl=0.105, br=0.026;
  const body=cyl(M.lampBody, br*0.86, br, bl, 18);
  at(body,0,bl/2,0); g.add(body);
  const knurl=cyl(M.rubber, br*0.90, br*0.90, bl*0.30, 18);
  at(knurl,0,bl*0.34,0); g.add(knurl);
  const bell=cyl(M.lampBody, br*1.42, br*0.96, bl*0.34, 20);
  at(bell,0,bl+bl*0.17,0); g.add(bell);
  const lens=cyl(M.lens, br*1.34, br*1.34, 0.006, 20);
  at(lens,0,bl+bl*0.34,0); g.add(lens);
  const hook=tor(M.steel, 0.012, 0.004, 14, Math.PI*1.4);
  at(hook,0,0.006,0); hook.rotation.x=Math.PI/2; g.add(hook);

  /* the beam: three nested shells, rescaled each frame to stop exactly where it lands —
     a fixed-length cone punched straight through the wall and read as a giant fan */
  const beamLen=1.0, beamR=0.30;
  const shells=[], cones=[];
  for(const [rs,inten] of [[1.0,0.34]]){   // ONE shell: nested cones read as wedges
    const geo=new T3.ConeGeometry(beamR*rs, beamLen, 34, 1, true);
    const mat=new T3.ShaderMaterial({
      vertexShader: beamVert.replace("uHeight", String(beamLen.toFixed(3))),
      fragmentShader: beamFrag,
      uniforms:{ uColor:{value:new T3.Color(0xFFEFC9)}, uIntensity:{value:inten} },
      transparent:true, depthWrite:false, blending:T3.AdditiveBlending,
      side:T3.DoubleSide,
    });
    const cone=new T3.Mesh(geo,mat);
    /* ConeGeometry apex is +Y; we want the apex at the lens and the mouth out along +Y */
    cone.rotation.z=Math.PI;
    cone.position.set(0, bl+bl*0.34 + beamLen/2, 0);
    cone.renderOrder=6;
    g.add(cone);
    shells.push(mat); cones.push(cone);
  }
  const lensY = bl+bl*0.34;
  /* the actual light */
  const spot=new T3.SpotLight(0xFFEBC4, 0, 3000, 0.30, 0.42, 1.35);
  spot.castShadow=true;
  spot.shadow.mapSize.set(1024,1024);
  spot.shadow.bias=-0.0016;
  spot.shadow.normalBias=2.4;
  spot.position.set(0, bl+bl*0.34, 0);
  g.add(spot);
  const tgt=new T3.Object3D();
  tgt.position.set(0, bl+bl*0.34+1, 0);
  g.add(tgt);
  spot.target=tgt;

  /* a hot glow on the lens itself */
  const halo=new T3.Sprite(new T3.SpriteMaterial({
    map: haloTexture(), color:0xFFE9B8, transparent:true, depthWrite:false,
    blending:T3.AdditiveBlending, opacity:0 }));
  halo.scale.setScalar(0.20);
  halo.position.set(0, bl+bl*0.36, 0);
  g.add(halo);

  g.userData={ spot, shells, cones, halo, lensMat:M.lens, beamLen, lensY,
               /* d is the throw distance in the same units the group is scaled in */
               /* dLocal is in the lamp's own (scaled) units; dWorld is in scene units.
                  three.js does NOT scale a light's `distance` by its parent, so the range has
                  to be given in world units or the spot dies before it leaves the lens. */
               setThrow(dLocal, dWorld){
                 const k = Math.max(0.05, dLocal)/beamLen;
                 for(const c of cones){ c.scale.setScalar(k); c.position.y = lensY + dLocal/2; }
                 spot.target.position.set(0, lensY + dLocal, 0);
                 spot.distance = Math.max(40, (dWorld||dLocal)*3.2);
               },
               grip:new T3.Vector3(0, bl*0.36, 0),
               tip :new T3.Vector3(0, bl+bl*0.34, 0) };
  return g;
};
function haloTexture(){
  const c=document.createElement("canvas"); c.width=c.height=128;
  const x=c.getContext("2d");
  const g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,"rgba(255,255,255,1)");
  g.addColorStop(0.18,"rgba(255,240,200,0.72)");
  g.addColorStop(0.5,"rgba(255,225,160,0.20)");
  g.addColorStop(1,"rgba(255,210,140,0)");
  x.fillStyle=g; x.fillRect(0,0,128,128);
  const t=new T3.CanvasTexture(c); t.colorSpace=T3.SRGBColorSpace; return t;
}

/* =====================================================================
   CABLE + PLUG
   ===================================================================== */
CREW.makeCoil = function(){
  const g=new T3.Group();
  for(let i=0;i<5;i++){
    const t=tor(M.cable, 0.115 - i*0.004, 0.011, 26);
    at(t, (hash(i*3.3)-0.5)*0.012, 0, i*0.016 - 0.032);
    t.rotation.x = (hash(i*7.1)-0.5)*0.10;
    g.add(t);
  }
  g.userData={ r:0.115 };
  return g;
};
CREW.makePlug = function(){
  const g=new T3.Group();
  const b=box(M.rubber, 0.036, 0.048, 0.030);
  at(b,0,0,0); g.add(b);
  const collar=cyl(M.rubber, 0.013, 0.016, 0.030, 12);
  at(collar,0,-0.036,0); g.add(collar);
  for(const sx of [-1,1]){
    const pin=cyl(M.steel, 0.0045,0.0045, 0.026, 8);
    at(pin, sx*0.010, 0.034, 0);
    g.add(pin);
  }
  g.userData={ grip:new T3.Vector3(0,-0.010,0), tip:new T3.Vector3(0,0.047,0) };
  return g;
};

/* =====================================================================
   HEADGEAR + a hint of workwear, so the two characters read apart instantly
   ===================================================================== */
CREW.makeCap = function(){
  const g=new T3.Group();
  const crown=new T3.Mesh(new T3.SphereGeometry(0.072, 20, 14, 0, 6.2832, 0, Math.PI/2), M.cap);
  crown.castShadow=true; g.add(crown);
  const peak=new T3.Mesh(new T3.CircleGeometry(0.078, 20, Math.PI*0.72, Math.PI*0.56), M.cap);
  peak.rotation.x=-Math.PI/2 + 0.22;
  at(peak,0,0.004,0.010);
  peak.castShadow=true; g.add(peak);
  /* a few paint flecks on it */
  for(let i=0;i<7;i++){
    const a=hash(i*5.3)*6.2832, p=hash(i*9.7)*1.2;
    const f=new T3.Mesh(new T3.SphereGeometry(0.005+hash(i*2.1)*0.005, 6, 5),
      new T3.MeshStandardMaterial({ color:new T3.Color().setHSL(hash(i*11.7),0.5,0.45), roughness:0.4 }));
    at(f, Math.cos(a)*Math.sin(p)*0.070, Math.cos(p)*0.070, Math.sin(a)*Math.sin(p)*0.070);
    g.add(f);
  }
  return g;
};
CREW.makeHelmet = function(){
  const g=new T3.Group();
  const shell=new T3.Mesh(new T3.SphereGeometry(0.108, 22, 14, 0, 6.2832, 0, Math.PI*0.58), M.helmet);
  shell.castShadow=true; g.add(shell);
  const brim=new T3.Mesh(new T3.TorusGeometry(0.100, 0.013, 8, 26), M.helmet);
  brim.rotation.x=Math.PI/2; at(brim,0,0.004,0); brim.castShadow=true; g.add(brim);
  const peak=new T3.Mesh(new T3.CircleGeometry(0.128, 20, Math.PI*0.76, Math.PI*0.48), M.helmet);
  peak.rotation.x=-Math.PI/2+0.10; at(peak,0,0.006,0.012); peak.castShadow=true; g.add(peak);
  for(let i=-1;i<=1;i++){
    const rib=box(M.helmet, 0.010, 0.026, 0.088);
    at(rib, i*0.034, 0.082, 0);
    rib.rotation.x=0.0; g.add(rib);
  }
  /* head torch, so he still reads as lit when the lamp is down at his side */
  const lampS=box(M.lampBody, 0.030, 0.020, 0.018);
  at(lampS, 0, 0.062, 0.096); g.add(lampS);
  const lensS=cyl(M.lens, 0.009,0.009,0.005,12);
  lensS.rotation.x=Math.PI/2; at(lensS,0,0.062,0.107); g.add(lensS);
  return g;
};

/* a strap of hi-viz / an apron across the torso, parented to the spine */
CREW.makeVest = function(hiviz){
  const g=new T3.Group();
  const mat = hiviz ? M.hiviz : M.overall;
  for(const sx of [-1,1]){
    const strap=box(mat, 0.030, 0.190, 0.012);
    at(strap, sx*0.050, 0.055, 0.062);
    strap.rotation.z = -sx*0.16;
    g.add(strap);
  }
  const belt=box(mat, 0.150, 0.030, 0.014);
  at(belt, 0, -0.042, 0.058); g.add(belt);
  if(hiviz){
    for(const sx of [-1,1]){
      const band=box(M.steel, 0.032, 0.016, 0.013);
      at(band, sx*0.050, 0.020, 0.064);
      g.add(band);
    }
  }
  return g;
};

/* =====================================================================
   A rag hanging out of the back pocket — pure garnish, but it is the kind of detail that
   makes a rig read as a person doing a job.
   ===================================================================== */
CREW.makeRag = function(){
  const g=new T3.Group();
  const mat=new T3.MeshStandardMaterial({ color:0xD9CDB6, roughness:0.95, side:T3.DoubleSide });
  const seg=[];
  for(let i=0;i<4;i++){
    const p=new T3.Mesh(new T3.PlaneGeometry(0.052, 0.036), mat);
    p.castShadow=true;
    at(p, 0, -0.018 - i*0.030, 0);
    g.add(p); seg.push(p);
  }
  g.userData={ seg };
  return g;
};

})();
