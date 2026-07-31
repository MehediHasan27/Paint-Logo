/* =====================================================================
   LOGO CREW — the show
   Builds a schedule of ACTS for one whole loop, then each frame works out where the body,
   the props and the tools have to be for whichever act is running.

   The order inside a tick matters. The body is posed first and its matrices flushed; the
   props are then placed against the resulting shoulder/hip positions; only then are the arms
   solved onto the props. Placing a prop from last frame's shoulder is exactly how a carried
   ladder ends up floating an inch off the hand.

   The beat sheet is the same for both personas — walk, set the ladder down, put the kit on
   the shelf, climb, work, come down, pick everything up — which is what lets the painter and
   the electrician share one rig and one schedule builder.
   ===================================================================== */
(function(){
"use strict";
const CREW = window.CREW;
if(!CREW || CREW.dead) return;
const T3 = THREE;
const { clamp, lerp, easeIO, easeOut, easeIn, approach, hash,
        CFG, S, DATA, RIG, HUMAN, SLOTS } = CREW;

const V = (x,y,z) => new T3.Vector3(x||0,y||0,z||0);
const _a=V(), _b=V(), _c=V(), _d=V(), _e=V(), _f=V(), _g=V();
const _q=new T3.Quaternion();
const UP = V(0,1,0);
const CZ = () => CFG.layout.charZ;

/* how far round he turns to face his work: three-quarter back, so the shoulder and the tool
   read but the face is not lost entirely */
const FACE_WORK = Math.PI*0.70;
const FACE_WALK = Math.PI*0.50;

/* =====================================================================
   KIT
   ===================================================================== */
const KIT = {};
function buildKit(){
  KIT.ladder = CREW.makeLadder();
  KIT.kettle = CREW.makeKettle();
  KIT.brush  = CREW.makeBrush();
  KIT.roller = CREW.makeRoller();
  KIT.lamp   = CREW.makeLamp();
  KIT.coil   = CREW.makeCoil();
  KIT.plug   = CREW.makePlug();
  KIT.cap    = CREW.makeCap();
  KIT.helmet = CREW.makeHelmet();
  KIT.vestP  = CREW.makeVest(false);
  KIT.vestE  = CREW.makeVest(true);
  for(const k in KIT) CREW.scene.add(KIT[k]);
  KIT.bus = CREW.makeTube(48, 7, CREW.MAT.cable);
  CREW.scene.add(KIT.bus);
  KIT.branch = [];
  for(let i=0;i<6;i++){
    const t = CREW.makeTube(24, 7, CREW.MAT.cable);
    t.visible = false;
    CREW.scene.add(t);
    KIT.branch.push({ mesh:t, on:false, pts:null });
  }
  for(const m of KIT.lamp.userData.shells)
    if(m.userData_base == null) m.userData_base = m.uniforms.uIntensity.value;
  hideAll();
}
function hideAll(){
  for(const k of ["ladder","kettle","brush","roller","lamp","coil","plug","cap","helmet","vestP","vestE"])
    if(KIT[k]) KIT[k].visible = false;
  if(KIT.bus) KIT.bus.visible = false;
  for(const b of (KIT.branch||[])){ b.mesh.visible=false; b.on=false; }
}

/* =====================================================================
   SCHEDULE
   Any act may move him: x0 -> x1 with an ease, and the gait is driven off the derivative, so
   there is no separate notion of "a walking act".
   ===================================================================== */
const SHOW = CREW.SHOW = {
  persona:"painter", acts:[], dur:0, t:0, playing:true, act:null, actK:0, pass:0,
};

function ladderXFor(i){ return S.slots[i].x + CFG.ladder.offsetX*S.slotW; }

function buildSchedule(persona){
  const acts = [];
  let t = 0, cx = -S.W*0.18;
  const push = (kind, dur, d) => {
    const a = Object.assign({ kind, t0:t, dur, x0:cx, x1:cx }, d||{});
    a.t1 = t + dur; acts.push(a); t += dur; return a;
  };
  const move = (kind, to, dur, d) => {
    const a = push(kind, dur != null ? dur
      : Math.max(0.18, Math.abs(to-cx)/(S.W*CFG.walk.speed)), d);
    a.x1 = to; cx = to;
    return a;
  };
  const paint = persona === "painter";

  for(let pass=0; pass<2; pass++){
    push("offstage", 0.001, { pass, setX:-S.W*0.18 });
    cx = -S.W*0.18;

    for(let i=0;i<S.perPass;i++){
      const data = DATA[(pass*S.perPass + i) % DATA.length];
      const lx = ladderXFor(i) + S.stature*0.26;
      if(i === 0){
        move("walk", lx, null, { pass, slot:i });
        push("setLadder", 0.34, { pass, slot:i });
      }else{
        /* he does not re-shoulder it for two metres — he lifts it, walks it across, and
           drops it again, which is both faster and what actually happens */
        move("shift", lx, Math.max(0.42, Math.abs(lx-cx)/(S.W*CFG.walk.speed*0.72)),
             { pass, slot:i });
        push("setLadder", 0.26, { pass, slot:i });
      }
      push("kitUp", 0.24, { pass, slot:i });         // kettle / lamp onto the shelf
      push("climb", 0.42, { pass, slot:i });

      if(paint){
        if(pass === 1){
          push("dip",    0.20, { pass, slot:i, wash:true });
          push("stroke", 0.52, { pass, slot:i, layer:"wash" });
        }
        push("dip",    0.22, { pass, slot:i, data });
        push("stroke", 0.74, { pass, slot:i, layer:"logo", data });
        push("admire", 0.20, { pass, slot:i, data });
      }else{
        if(pass === 1){
          push("unplug", 0.30, { pass, slot:i });
          push("dieout", 0.30, { pass, slot:i });
          push("spin",   0.48, { pass, slot:i, data });
        }
        push("plugin", 0.38, { pass, slot:i, data });
        push("charge", 0.60, { pass, slot:i, data });
        push("admire", 0.18, { pass, slot:i, data });
      }
      push("descend", 0.36, { pass, slot:i });
      push("kitDown", 0.22, { pass, slot:i });
    }
    push("lift", 0.26, { pass });
    move("exit", S.W*1.18, null, { pass });
    push("wait", 1.9, { pass });   // the beat between cycles
  }
  SHOW.acts = acts;
  SHOW.dur  = t;
}

function actAt(time){
  const a = SHOW.acts;
  let lo=0, hi=a.length-1;
  while(lo<hi){ const m=(lo+hi)>>1; if(a[m].t1 <= time) lo=m+1; else hi=m; }
  return a[lo];
}

/* =====================================================================
   PERSISTENT STATE
   ===================================================================== */
const ST = {
  ladderX:0, ladderLift:0, ladderYaw:0,
  kitOn:"hand",              // hand | shelf
  kettleSwing:{ x:0, vx:0 }, lastHandX:null,
  climb:0,
  faceY:FACE_WALK,
  speed:0,
  stroke:{ slot:-1, u:0, v:0, started:false },
  lampTarget:V(),
  busX:0,
  lastContact:null, onLadder:false,
  seedTick:0,
};

/* =====================================================================
   HELPERS
   ===================================================================== */
function forwardVec(out){ return (out||V()).set(Math.sin(ST.faceY), 0, Math.cos(ST.faceY)); }
function leftVec(out){ return (out||V()).set(Math.cos(ST.faceY), 0, -Math.sin(ST.faceY)); }

function handTo(side, pos, shaft, upHint, pole, grip){
  if(!CREW.handsReady()) return;       // the character loads async; the wall runs without him
  const h = RIG.hand[side];
  h.active = true;
  h.pos.copy(pos);
  CREW.handGripQuat(side, shaft, upHint, h.quat);
  h.pole.copy(pole).normalize();
  h.grip = grip == null ? 1 : grip;
}
function handFree(side){ RIG.hand[side].active = false; }
const POLE_DOWN = V(0,-1,0.55);

/* One-shots fired off a narrow k window get stepped straight over by a fixed timestep — the
   first sample inside a 0.74s act already lands at k=0.02. Everything that must happen
   exactly once per act is a latch instead: true on the first frame the condition holds. */
function once(o, key, cond){
  if(cond){ if(!o[key]){ o[key] = 1; return true; } return false; }
  o[key] = 0;
  return false;
}

/* ---- ladder ------------------------------------------------------- */
function placeLadder(x, lift){
  const L = KIT.ladder;
  L.scale.setScalar(S.stature);
  L.rotation.set(0, ST.ladderYaw, 0);
  L.position.set(CREW.wx(x, CZ()), HUMAN.groundW + lift, CZ());
  L.updateMatrixWorld(true);
}
function ladderLocalW(x, y, z, out){
  return (out||V()).set(x, y, z).multiplyScalar(S.stature)
    .applyQuaternion(KIT.ladder.quaternion).add(KIT.ladder.position);
}
function treadW(i, side, out){
  const u = KIT.ladder.userData;
  const y = i < 0 ? 0 : u.treadY(i);
  return ladderLocalW(-0.030 + (side||0)*0.046, y, u.treadZ, out);
}
function shelfW(out){
  const u = KIT.ladder.userData;
  return ladderLocalW(u.shelf.x, u.shelf.y, u.shelf.z, out);
}
function shelfOffsetW(out, dx){
  const u = KIT.ladder.userData;
  return ladderLocalW(u.shelf.x + dx, u.shelf.y, u.shelf.z, out);
}
/* the top rail, where a hand takes it to carry it */
function ladderGripW(out){
  const u = KIT.ladder.userData;
  return ladderLocalW(u.grip.x, u.grip.y, u.grip.z, out);
}

/* ---- climbing ----------------------------------------------------- */
function climbFeet(p){
  /* p is how many treads up he is: -1 = both feet on the floor */
  const u = KIT.ladder.userData;
  const stepY = i => (i < 0 ? 0 : u.treadY(i));
  let lowest = Infinity;
  for(const side of ["Left","Right"]){
    const lead = side === "Right" ? 0 : 0.5;
    const ph = p + lead;
    const target = Math.floor(ph);
    const frac = clamp((ph - target)*2, 0, 1);
    const from = target - 1;
    const a = treadW(from, side==="Left" ? 1 : -1, _a).clone();
    const b = treadW(target, side==="Left" ? 1 : -1, _b).clone();
    const f = RIG.foot[side];
    const e = easeIO(frac);
    f.x = lerp(a.x,b.x,e);
    f.y = lerp(a.y,b.y,e);
    f.z = lerp(a.z,b.z,e) + Math.sin(Math.PI*frac)*S.stature*0.055 + S.stature*0.020;
    f.lift = 0; f.level = 0.60;
    f.pole = _c.set(Math.sin(ST.ladderYaw), 0.28, Math.cos(ST.ladderYaw)).normalize().clone().negate();
    lowest = Math.min(lowest, f.y);
    if(frac > 0.02 && frac < 0.10 && target >= 0) CREW.sfx.rung();
  }
  RIG.hipLift = lowest - HUMAN.groundW;
}
/* the working stance: braced, one foot a tread higher than the other */
function climbHold(){
  const T = CFG.ladder.standTread;
  const u = KIT.ladder.userData;
  const fL = treadW(T+1, 1, _a).clone(), fR = treadW(T, -1, _b).clone();
  RIG.foot.Left.x  = fL.x; RIG.foot.Left.y  = fL.y; RIG.foot.Left.z  = fL.z + S.stature*0.020;
  RIG.foot.Right.x = fR.x; RIG.foot.Right.y = fR.y; RIG.foot.Right.z = fR.z + S.stature*0.020;
  for(const s of ["Left","Right"]){
    RIG.foot[s].lift = 0; RIG.foot[s].level = 0.60;
    RIG.foot[s].pole = _c.set(Math.sin(ST.ladderYaw), 0.28, Math.cos(ST.ladderYaw)).normalize().clone().negate();
  }
  RIG.hipLift = Math.min(fL.y, fR.y) - HUMAN.groundW;
}

/* ---- kettle ------------------------------------------------------- */
function placeKettle(gripPos, tilt){
  const u = KIT.kettle.userData, sc = S.stature;
  KIT.kettle.scale.setScalar(sc);
  KIT.kettle.quaternion.setFromAxisAngle(_a.set(0,0,1), tilt||0);
  _a.copy(u.grip).multiplyScalar(sc).applyQuaternion(KIT.kettle.quaternion);
  KIT.kettle.position.copy(gripPos).sub(_a);
  KIT.kettle.updateMatrixWorld(true);
}
function kettleDipW(out){
  const u = KIT.kettle.userData;
  return (out||V()).copy(u.dip).multiplyScalar(S.stature)
    .applyQuaternion(KIT.kettle.quaternion).add(KIT.kettle.position);
}
/* the kettle hangs from a hand and lags it */
function swingKettle(handPos, dt){
  const sw = ST.kettleSwing;
  const dx = ST.lastHandX == null ? 0 : handPos.x - ST.lastHandX;
  ST.lastHandX = handPos.x;
  sw.vx += (-sw.x*120 - sw.vx*11)*dt - dx*22;
  sw.x  += sw.vx*dt;
  placeKettle(handPos, clamp(sw.x*0.011, -0.40, 0.40));
}
/* the kettle standing on the ladder's shelf */
function kettleOnShelf(){
  const p = shelfOffsetW(_a, 0.078);        // to one side, so it is clear of his shins
  const u = KIT.kettle.userData, sc = S.stature;
  KIT.kettle.scale.setScalar(sc);
  KIT.kettle.quaternion.identity();
  KIT.kettle.position.copy(p);
  KIT.kettle.updateMatrixWorld(true);
}

function dustPuff(x,y,z,n,sc){
  for(let i=0;i<n;i++){
    const a = hash(ST.seedTick++ * 3.7)*6.2832;
    CREW.emit({ x, y, z, vx:Math.cos(a)*sc*0.30, vy:sc*(0.04+hash(i*5.1)*0.18),
                vz:Math.sin(a)*sc*0.24, life:0.5+hash(i*7.3)*0.4,
                size:sc*(0.03+hash(i*9.7)*0.05), color:"#CBB99C",
                kind:CREW.KIND.DUST, grav:170, drag:0.10 });
  }
}

/* =====================================================================
   STAMPING
   Interpolated between frames, so coverage never depends on frame rate: at 30fps the tool
   simply lays down more stamps per step instead of leaving gaps.
   ===================================================================== */
function strokeTo(s, u, v, ang, roller, seed){
  const st = ST.stroke;
  if(st.slot !== s.i || !st.started){
    st.slot = s.i; st.u = u; st.v = v; st.started = true;
    if(roller) CREW.stampRoller(s, u, v, ang, seed); else CREW.stampBrush(s, u, v, ang, 1, seed);
    return;
  }
  const du = u - st.u, dv = v - st.v;
  const dist = Math.hypot(du*s.cw, dv*s.ch);
  const step = roller ? s.ch*0.10 : Math.max(1.2, (s.band||s.ch*0.3)*CFG.paint.brushBite*0.32);
  const n = Math.min(64, Math.max(1, Math.ceil(dist/step)));
  for(let i=1;i<=n;i++){
    const k = i/n;
    const uu = st.u + du*k, vv = st.v + dv*k;
    if(roller) CREW.stampRoller(s, uu, vv, ang, seed+i);
    else       CREW.stampBrush(s, uu, vv, ang, 1, seed+i*7.7);
  }
  st.u = u; st.v = v;
}

/* the shared "tool working the wall" step, used by brush and roller alike */
function workSurface(s, a, k, wash){
  if(s.__layerAct !== a){
    s.__layerAct = a;
    ST.stroke.started = false;
    CREW.slotBeginLayer(s, wash ? "wash" : "logo", a.data);
    if(wash) CREW.sfx.roller(a.dur*0.9); else CREW.sfx.brush(a.dur*0.9);
  }
  const plan = s.plan;
  if(!plan) return;
  const p = plan.sample(k);
  const tipW = CREW.slotPointW(s, p.u, p.v, p.off, _a);
  const trav = _b.set(p.du*s.wW, -p.dv*s.hW, 0);
  if(trav.lengthSq() < 1e-9) trav.set(1,0,0);
  trav.normalize();
  const ang = Math.atan2(p.dv*s.ch, p.du*s.cw);

  const tool = wash ? KIT.roller : KIT.brush;
  KIT.roller.visible = wash; KIT.brush.visible = !wash;
  /* Aim the shaft along his own shoulder-to-work line rather than at a fixed angle. A fixed
     aim pointed the brush steeply into the screen: it foreshortened away to a stub AND put
     the grip somewhere his arm could not quite reach, so the tool floated off the hand. This
     way the tool is always a straight extension of the arm, and it is reachable by
     construction. A little upward bias keeps the wrist above the line, as a real one is. */
  const sh = CREW.boneAt("RightArm", _g);
  const aim = _c.copy(tipW).sub(sh).normalize().addScaledVector(UP, 0.16).normalize();
  const gripW = CREW.placeTool(tool, tipW, aim, trav);
  handTo("Right", gripW, CREW.toolShaft(tool,_d), UP, POLE_DOWN, 1);
  if(wash){
    const g2 = CREW.toolPoint(tool, tool.userData.grip2, _e);
    handTo("Left", g2, CREW.toolShaft(tool,_f), UP, POLE_DOWN, 1);
  }
  /* he leans into the far end of a sweep rather than stretching an arm at it */
  RIG.lean = Math.max(RIG.lean, 0.10*Math.abs(p.u-0.5)*2);

  if(p.off < 0.10){
    strokeTo(s, p.u, p.v, ang, wash, s.i*31.7 + Math.floor(k*400));
    if(hash(ST.seedTick++) > (wash ? 0.90 : 0.85)){
      const tint = wash ? "#F3EDE1" : (a.data ? a.data.tint : "#C2603C");
      const sp = S.stature*(0.25+hash(ST.seedTick*3.1)*0.6);
      CREW.emit({ x:tipW.x, y:tipW.y, z:tipW.z,
                  vx:(hash(ST.seedTick*5.3)-0.5)*sp, vy:(0.15+hash(ST.seedTick*7.1))*sp*0.6,
                  vz:sp*(0.35+hash(ST.seedTick*9.7)*0.5),
                  life:0.9, size:S.stature*(0.008+hash(ST.seedTick*11.3)*0.012),
                  color:tint, kind:CREW.KIND.FLECK, grav:1500 });
    }
    s.__dripArmed = 1;
  }else{
    ST.stroke.started = false;                 // lifted off: do not draw the travel move
    if(s.__dripArmed && !wash){
      s.__dripArmed = 0;
      if(hash(s.i*17.3 + Math.floor(k*20)) < CFG.paint.dripChance)
        CREW.slotDrip(s, clamp(p.u + (hash(k*31.1)-0.5)*0.25, 0.06, 0.94), p.v+0.03,
                      s.i*7.1 + k*100);
    }
  }
  if(once(s, "__done", k > 0.97)){ s.pop = 1; CREW.sfx.splat(); }
}

/* =====================================================================
   PAINTER
   ===================================================================== */
const PAINTER = {
  dress(){
    hideAll();
    KIT.ladder.visible = KIT.kettle.visible = KIT.brush.visible = true;
  },
  /* the brush lives in the kettle whenever it is not in his hand */
  stowBrush(){
    const u = KIT.kettle.userData;
    KIT.brush.visible = true;
    KIT.roller.visible = false;
    KIT.brush.scale.setScalar(S.stature);
    KIT.brush.quaternion.copy(KIT.kettle.quaternion)
      .multiply(_q.setFromAxisAngle(_a.set(0,0,1), 0.30));
    _b.copy(u.dip).multiplyScalar(S.stature).applyQuaternion(KIT.kettle.quaternion);
    KIT.brush.position.copy(KIT.kettle.position).add(_b)
      .addScaledVector(_c.set(0,1,0).applyQuaternion(KIT.brush.quaternion), -S.stature*0.02);
  },
  carryKit(dt){
    /* ladder in the right hand at his side, kettle swinging from the left */
    const shR = CREW.boneAt("RightArm", _a);
    const drop = _b.copy(shR).addScaledVector(UP, -HUMAN.armLen*0.98)
                             .addScaledVector(leftVec(_c), -S.stature*0.075);
    ST.ladderYaw = ST.faceY - Math.PI;
    KIT.ladder.scale.setScalar(S.stature);
    KIT.ladder.rotation.set(0.30, ST.ladderYaw, 0);   // tilted, feet trailing
    KIT.ladder.updateMatrixWorld(true);
    const gl = ladderGripW(_d);
    KIT.ladder.position.add(_e.copy(drop).sub(gl));
    KIT.ladder.updateMatrixWorld(true);
    handTo("Right", drop, _f.set(1,0,0), UP, POLE_DOWN, 1);

    const shL = CREW.boneAt("LeftArm", _a);
    const hang = _b.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.96)
                             .addScaledVector(leftVec(_c), S.stature*0.055);
    swingKettle(hang, dt);
    this.stowBrush();
    handTo("Left", hang, _d.set(1,0,0), UP, POLE_DOWN, 1);
  },
  apply(a, k, dt){
    const s = a.slot != null ? SLOTS[a.slot] : null;
    switch(a.kind){
      case "offstage": case "wait": case "walk": case "exit":
        ST.climb = 0; ST.kitOn = "hand";
        this.carryKit(dt);
        break;

      /* lifting the ladder and walking it two steps to the next slot */
      case "shift": {
        ST.climb = 0;
        const lift = Math.sin(Math.PI*k)*S.stature*CFG.ladder.setDown*4;
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(lerp(a.x0, a.x1, easeIO(k)), lift + S.stature*0.02);
        const g = ladderGripW(_a);
        handTo("Right", g, _b.set(1,0,0), UP, POLE_DOWN, 1);
        const shL = CREW.boneAt("LeftArm", _c);
        const hang = _d.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.96)
                                 .addScaledVector(leftVec(_e), S.stature*0.055);
        swingKettle(hang, dt);
        this.stowBrush();
        handTo("Left", hang, _f.set(1,0,0), UP, POLE_DOWN, 1);
        break;
      }
      case "setLadder": case "lift": {
        const down = a.kind === "setLadder";
        const kk = down ? k : 1-k;
        ST.ladderYaw = ST.faceY - Math.PI;
        const tilt = lerp(0, 0.30, kk);
        KIT.ladder.rotation.set(tilt, ST.ladderYaw, 0);
        placeLadder(a.x1, lerp(0, S.stature*0.10, kk));
        RIG.crouch = Math.sin(Math.PI*kk)*0.30;
        const g = ladderGripW(_a);
        handTo("Right", g, _b.set(1,0,0), UP, POLE_DOWN, 1);
        const shL = CREW.boneAt("LeftArm", _c);
        const hang = _d.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.96);
        swingKettle(hang, dt);
        this.stowBrush();
        handTo("Left", hang, _e.set(1,0,0), UP, POLE_DOWN, 1);
        if(down && once(a, "__thud", k > 0.72)){
          CREW.sfx.setDown();
          dustPuff(KIT.ladder.position.x, HUMAN.groundW, KIT.ladder.position.z + S.stature*0.1,
                   7, S.stature*0.8);
        }
        break;
      }
      /* the kettle goes up onto the shelf so both hands are free */
      case "kitUp": case "kitDown": {
        const up = a.kind === "kitUp";
        const kk = up ? easeIO(k) : easeIO(1-k);
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(a.x1, 0);
        const shelf = shelfOffsetW(_a, 0.078).clone();
        const shL = CREW.boneAt("LeftArm", _b);
        const hand = _c.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.96);
        const p = _d.copy(hand).lerp(shelf, kk);
        placeKettle(p, 0);
        this.stowBrush();
        handTo("Left", p, _e.set(1,0,0), UP, POLE_DOWN, kk > 0.92 ? 0.30 : 1);
        handFree("Right");
        RIG.lean = 0.10*kk;
        ST.kitOn = (up && kk > 0.9) ? "shelf" : "hand";
        if(up && once(a, "__set", k > 0.86)) CREW.sfx.setDown();
        break;
      }
      case "climb": case "descend": {
        const kk = a.kind === "climb" ? k : 1-k;
        ST.climb = kk;
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(a.x1, 0);
        kettleOnShelf(); this.stowBrush();
        climbFeet(lerp(-1, CFG.ladder.standTread, easeIO(kk)));
        RIG.lean = 0.22;
        /* hands take the stiles as he goes */
        const u = KIT.ladder.userData;
        const hy = clamp(u.treadY(CFG.ladder.standTread) + 0.16 + kk*0.10, 0.2, u.top);
        handTo("Right", ladderLocalW(-u.halfWAt(hy), hy, u.treadZ-0.01, _a),
               _b.set(0,1,0).applyQuaternion(KIT.ladder.quaternion), UP, _c.set(0,-0.5,1), 1);
        handTo("Left",  ladderLocalW( u.halfWAt(hy), hy, u.treadZ-0.01, _d),
               _e.set(0,1,0).applyQuaternion(KIT.ladder.quaternion), UP, _f.set(0,-0.5,1), 1);
        break;
      }
      /* loading the brush out of the kettle on the shelf */
      case "dip": {
        holdOnLadder();
        kettleOnShelf();
        KIT.brush.visible = true; KIT.roller.visible = false;
        const dipP = kettleDipW(_a).clone();
        const rest = _b.copy(dipP).addScaledVector(UP, S.stature*0.30);
        const tipT = k < 0.55 ? _c.copy(rest).lerp(dipP, easeIO(k/0.55))
                              : _c.copy(dipP).lerp(rest, easeIO((k-0.55)/0.45));
        const gripW = CREW.placeTool(KIT.brush, tipT, _d.set(0.12,-1,0.10).normalize(),
                                     _e.set(1,0,0));
        handTo("Right", gripW, CREW.toolShaft(KIT.brush,_f), UP, POLE_DOWN, 1);
        handFree("Left");
        const tint = a.wash ? "#F3EDE1" : (a.data ? a.data.tint : "#C2603C");
        KIT.brush.userData.tipMat.color.set(tint);
        KIT.kettle.userData.paintMat.color.set(tint);
        if(once(a, "__dipSfx", k > 0.50)) CREW.sfx.dip();
        if(k > 0.62 && hash(ST.seedTick++) > 0.88)
          CREW.emit({ x:tipT.x, y:tipT.y, z:tipT.z, vx:0, vy:-18, vz:0, life:0.30,
                      size:S.stature*0.014, color:tint, kind:CREW.KIND.FLECK, grav:900 });
        break;
      }
      case "stroke": {
        holdOnLadder();
        kettleOnShelf();
        workSurface(s, a, k, a.layer === "wash");
        break;
      }
      /* a beat of looking at what he just did — the thing that makes it read as a person */
      case "admire": {
        holdOnLadder();
        kettleOnShelf(); this.stowBrush();
        handFree("Right"); handFree("Left");
        RIG.lean = -0.06*Math.sin(Math.PI*k);
        break;
      }
    }
  },
};

/* =====================================================================
   ELECTRICIAN
   ===================================================================== */
const ELEC = {
  dress(){
    hideAll();
    KIT.ladder.visible = KIT.lamp.visible = KIT.coil.visible = true;
    KIT.plug.visible = KIT.helmet.visible = true;
    KIT.bus.visible = true;
  },
  carryKit(dt, s){
    const shR = CREW.boneAt("RightArm", _a);
    const drop = _b.copy(shR).addScaledVector(UP, -HUMAN.armLen*0.98)
                             .addScaledVector(leftVec(_c), -S.stature*0.075);
    ST.ladderYaw = ST.faceY - Math.PI;
    KIT.ladder.scale.setScalar(S.stature);
    KIT.ladder.rotation.set(0.30, ST.ladderYaw, 0);
    KIT.ladder.updateMatrixWorld(true);
    const gl = ladderGripW(_d);
    KIT.ladder.position.add(_e.copy(drop).sub(gl));
    KIT.ladder.updateMatrixWorld(true);
    handTo("Right", drop, _f.set(1,0,0), UP, POLE_DOWN, 1);
    aimLampFromHand(dt, s);
    stowPlug();
  },
  apply(a, k, dt){
    const s = a.slot != null ? SLOTS[a.slot] : null;
    switch(a.kind){
      case "offstage": case "wait": case "walk": case "exit":
        ST.climb = 0; ST.kitOn = "hand";
        this.carryKit(dt, null);
        break;
      case "shift": {
        ST.climb = 0;
        const lift = Math.sin(Math.PI*k)*S.stature*CFG.ladder.setDown*4;
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(lerp(a.x0, a.x1, easeIO(k)), lift + S.stature*0.02);
        handTo("Right", ladderGripW(_a), _b.set(1,0,0), UP, POLE_DOWN, 1);
        aimLampFromHand(dt, s); stowPlug();
        break;
      }
      case "setLadder": case "lift": {
        const down = a.kind === "setLadder";
        const kk = down ? k : 1-k;
        ST.ladderYaw = ST.faceY - Math.PI;
        KIT.ladder.rotation.set(lerp(0,0.30,kk), ST.ladderYaw, 0);
        placeLadder(a.x1, lerp(0, S.stature*0.10, kk));
        RIG.crouch = Math.sin(Math.PI*kk)*0.30;
        handTo("Right", ladderGripW(_a), _b.set(1,0,0), UP, POLE_DOWN, 1);
        aimLampFromHand(dt, s); stowPlug();
        if(down && once(a, "__thud", k > 0.72)){
          CREW.sfx.setDown();
          dustPuff(KIT.ladder.position.x, HUMAN.groundW, KIT.ladder.position.z + S.stature*0.1,
                   7, S.stature*0.8);
        }
        break;
      }
      /* the lamp is hooked on the shelf lip and left pointing at the sign */
      case "kitUp": case "kitDown": {
        const up = a.kind === "kitUp";
        const kk = up ? easeIO(k) : easeIO(1-k);
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(a.x1, 0);
        const hook = shelfW(_a).clone().addScaledVector(UP, S.stature*0.02);
        const shL = CREW.boneAt("LeftArm", _b);
        const hand = _c.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.86);
        const p = _d.copy(hand).lerp(hook, kk);
        const want = s ? CREW.slotPointW(s, 0.5, 0.55, 0, _e).clone() : _e.set(p.x, p.y+100, p.z-200);
        const aim = _f.copy(want).sub(p).normalize();
        const lensAt = _g.copy(p).addScaledVector(aim, S.stature*0.14);
        const gripW = CREW.placeTool(KIT.lamp, lensAt, aim, UP);
        handTo("Left", gripW, CREW.toolShaft(KIT.lamp,_b), UP, POLE_DOWN, kk > 0.92 ? 0.30 : 1);
        handFree("Right");
        lampPower(want.distanceTo(lensAt));
        stowPlug();
        ST.kitOn = (up && kk > 0.9) ? "shelf" : "hand";
        break;
      }
      case "climb": case "descend": {
        const kk = a.kind === "climb" ? k : 1-k;
        ST.climb = kk;
        ST.ladderYaw = ST.faceY - Math.PI;
        placeLadder(a.x1, 0);
        lampOnShelf(s); stowPlug();
        climbFeet(lerp(-1, CFG.ladder.standTread, easeIO(kk)));
        RIG.lean = 0.22;
        const u = KIT.ladder.userData;
        const hy = clamp(u.treadY(CFG.ladder.standTread) + 0.16 + kk*0.10, 0.2, u.top);
        handTo("Right", ladderLocalW(-u.halfWAt(hy), hy, u.treadZ-0.01, _a),
               _b.set(0,1,0).applyQuaternion(KIT.ladder.quaternion), UP, _c.set(0,-0.5,1), 1);
        handTo("Left",  ladderLocalW( u.halfWAt(hy), hy, u.treadZ-0.01, _d),
               _e.set(0,1,0).applyQuaternion(KIT.ladder.quaternion), UP, _f.set(0,-0.5,1), 1);
        break;
      }
      case "unplug": {
        holdOnLadder(); lampOnShelf(s);
        const sock = socketW(s, _a).clone();
        const away = _b.copy(sock).addScaledVector(UP, -S.stature*0.10)
                       .addScaledVector(_c.set(0,0,1), S.stature*0.16);
        const p = _d.copy(sock).lerp(away, easeIn(k));
        plugAt(p);
        if(once(a, "__unp", k > 0.30)){ CREW.sfx.unplug(); dropBranch(s); }
        break;
      }
      case "dieout": {
        holdOnLadder(); lampOnShelf(s);
        const away = socketW(s, _a).clone().addScaledVector(UP, -S.stature*0.10)
                       .addScaledVector(_b.set(0,0,1), S.stature*0.16);
        plugAt(away);
        const bucket = Math.floor(k*24);
        const f = hash(bucket*3.1);
        s.flick = f > 0.52 ? (1-k)*1.25 : 0;
        s.litLevel = Math.max(0, 1-k*1.2);
        if(bucket !== s.__lastFlick){ s.__lastFlick = bucket; if(f > 0.52) CREW.sfx.flicker(); }
        if(k > 0.94){ CREW.slotDischarge(s); s.litLevel = 0; s.flick = 1; }
        break;
      }
      case "spin": {
        holdOnLadder(); lampOnShelf(s);
        plugAt(socketW(s,_a).clone().addScaledVector(UP,-S.stature*0.10)
                 .addScaledVector(_b.set(0,0,1), S.stature*0.16));
        s.spin = easeIO(k)*Math.PI;
        s.spinTo = s.spin;
        s.panel.rotation.y = s.spin;
        if(once(a, "__swapped", k > 0.5)) CREW.slotSetSign(s, a.data);
        if(k > 0.98){ s.spin = 0; s.spinTo = 0; s.panel.rotation.y = 0; }
        break;
      }
      case "plugin": {
        holdOnLadder(); lampOnShelf(s);
        if(!s.data) CREW.slotSetSign(s, a.data);
        const sock = socketW(s, _a).clone();
        const from = _b.copy(sock).addScaledVector(UP, -S.stature*0.14)
                       .addScaledVector(_c.set(0,0,1), S.stature*0.20);
        plugAt(_d.copy(from).lerp(sock, easeOut(k)));
        if(once(a, "__plugged", k > 0.86)){ CREW.sfx.plug(); connectBranch(s); }
        break;
      }
      case "charge": {
        holdOnLadder(); lampOnShelf(s);
        const sock = socketW(s, _a).clone();
        plugAt(sock, k > 0.22);
        if(once(a, "__sparked", k > 0.0)){
          CREW.sfx.spark(); CREW.sfx.ignite();
          for(let i=0;i<CFG.neon.sparks;i++){
            const ang = hash(i*3.7)*6.2832, sp = S.stature*(0.4+hash(i*5.1)*1.5);
            CREW.emit({ x:sock.x, y:sock.y, z:sock.z,
                        vx:Math.cos(ang)*sp, vy:Math.abs(Math.sin(ang))*sp*0.9,
                        vz:sp*0.30*hash(i*7.3),
                        life:0.18+hash(i*9.1)*0.28, size:S.stature*(0.010+hash(i*11.7)*0.014),
                        color: i%3 ? "#FFF6D2" : (s.data ? s.data.neon : "#9FD8FF"),
                        kind:CREW.KIND.SPARK, grav:2100, drag:0.09 });
          }
        }
        const c = clamp((k-0.06)/0.72, 0, 1);
        CREW.slotSetCharge(s, easeOut(c)*1.45);
        s.flick = k < 0.30 ? (hash(Math.floor(k*40)*7.7) > 0.42 ? 1 : 0.18) : 1;
        s.litLevel = Math.max(s.litLevel, easeOut(c));
        if(k > 0.985){ s.litLevel = 1; s.flick = 1; s.pop = 1; }
        break;
      }
      case "admire": {
        holdOnLadder(); lampOnShelf(s);
        plugAt(socketW(s,_a));
        handFree("Right"); handFree("Left");
        RIG.lean = -0.06*Math.sin(Math.PI*k);
        break;
      }
    }
  },
};

function holdOnLadder(){
  ST.climb = 1;
  RIG.lean = Math.max(RIG.lean, 0.16);
}

/* Anything the LEGS stand on has to exist before poseBody runs, because that is where the
   leg IK happens. Placing the ladder inside apply() — which runs after the body, so that
   carried props can be hung off the posed shoulder — left the legs solving onto last frame's
   targets, and he floated a foot in front of his own ladder. */
const GROUND_ACTS = { walk:1, exit:1, offstage:1, wait:1, shift:1,
                      setLadder:1, lift:1, kitUp:1, kitDown:1 };
function stagePre(a, k, dt, g){
  ST.ladderYaw = ST.faceY - Math.PI;
  const SIDE = S.stature*0.26;
  if(GROUND_ACTS[a.kind]){
    if(ST.onLadder){ CREW.resetGait(RIG.x); ST.onLadder = false; }
    ST.climb = 0;
    RIG.hipLift = 0;
    groundFeet(g);
    /* the ladder is only self-supporting once it is down; while carried it hangs off the
       hand, which is not known until the body has been posed */
    if(a.kind === "shift")
      placeLadder(lerp(a.x0, a.x1, easeIO(k)) - SIDE,
                  Math.sin(Math.PI*k)*S.stature*CFG.ladder.setDown*4 + S.stature*0.02);
    else if(a.kind === "setLadder")
      placeLadder(a.x1 - SIDE, lerp(S.stature*0.10, 0, easeIO(k)));
    else if(a.kind === "lift")
      placeLadder(a.x1 - SIDE, lerp(0, S.stature*0.10, easeIO(k)));
    else if(a.kind === "kitUp" || a.kind === "kitDown")
      placeLadder(a.x1 - SIDE, 0);
  }else if(a.kind === "climb" || a.kind === "descend"){
    ST.onLadder = true;
    const kk = a.kind === "climb" ? k : 1-k;
    ST.climb = kk;
    placeLadder(ST.ladderX, 0);
    climbFeet(lerp(-1, CFG.ladder.standTread, easeIO(kk)));
  }else{
    ST.onLadder = true;
    ST.climb = 1;
    placeLadder(ST.ladderX, 0);
    climbHold();
  }
}
function groundFeet(g){
  const kz = CREW.kAt(CZ());
  const lv = leftVec(_a);
  /* A foot planted further from the hips than the leg is long makes the IK give up and leave
     the limb sticking out straight — which is exactly what happened on the first step off the
     ladder, where the plants were still where he had been standing before he climbed it. */
  const maxLat = (HUMAN.legLen || S.stature*0.46) * 0.46;
  const bodyW = CREW.wx(RIG.x, CZ());
  for(const side of ["Left","Right"]){
    const f = RIG.foot[side];
    const sgn = side === "Left" ? 1 : -1;
    f.x = bodyW + clamp(CREW.wx(g[side].x, CZ()) - bodyW, -maxLat, maxLat)
        + lv.x*sgn*S.stature*0.055*kz;
    f.y = HUMAN.groundW + g[side].lift;
    f.z = CZ() + lv.z*sgn*S.stature*0.055*kz;
    f.lift = 0; f.level = 0.90;
    f.pole = forwardVec(_b).clone().add(V(0,0.20,0)).normalize();
  }
}
function socketW(s, out){ return CREW.slotPointW(s, s.socketU, s.socketV, 0, out); }

/* ---- electrician props -------------------------------------------- */
function lampPower(throwW){
  const u = KIT.lamp.userData;
  const on = CREW.themeMix();
  u.spot.intensity = on * S.stature*S.stature*0.075;
  u.halo.material.opacity = on*0.9;
  for(const m of u.shells) m.uniforms.uIntensity.value = on * (m.userData_base||0.3);
  /* the cone is scaled in the lamp's own local units, so the throw is too */
  if(throwW != null) u.setThrow(throwW / S.stature, throwW);
}
function aimLampFromHand(dt, s){
  const shL = CREW.boneAt("LeftArm", _a);
  const hand = _b.copy(shL).addScaledVector(UP, -HUMAN.armLen*0.66)
                           .addScaledVector(forwardVec(_c), S.stature*0.14)
                           .addScaledVector(leftVec(_d), S.stature*0.05);
  const want = s ? CREW.slotPointW(s, 0.5, 0.55, 0, _e).clone()
                 : _e.set(CREW.wx(RIG.x + (ST.speed<0?-1:1)*S.W*0.14, CFG.layout.wallZ),
                          CREW.wy(S.rowY, CFG.layout.wallZ), CFG.layout.wallZ).clone();
  ST.lampTarget.lerp(want, 1-Math.pow(0.0012, dt));
  const aim = _f.copy(ST.lampTarget).sub(hand).normalize();
  const lensAt = _g.copy(hand).addScaledVector(aim, S.stature*0.14);
  const gripW = CREW.placeTool(KIT.lamp, lensAt, aim, UP);
  handTo("Left", gripW, CREW.toolShaft(KIT.lamp,_c), UP, POLE_DOWN, 1);
  lampPower(ST.lampTarget.distanceTo(lensAt));
}
function lampOnShelf(s){
  const hook = shelfW(_a).clone().addScaledVector(UP, S.stature*0.02);
  const want = s ? CREW.slotPointW(s, 0.5, 0.55, 0, _b).clone() : _b.copy(hook).add(V(0,200,-200));
  const aim = _c.copy(want).sub(hook).normalize();
  const lensAt = _d.copy(hook).addScaledVector(aim, S.stature*0.14);
  CREW.placeTool(KIT.lamp, lensAt, aim, UP);
  lampPower(want.distanceTo(lensAt));
}
function stowPlug(){
  /* clipped to the coil on his hip */
  KIT.plug.scale.setScalar(S.stature);
  KIT.plug.quaternion.copy(KIT.coil.quaternion);
  KIT.plug.position.copy(KIT.coil.position)
    .addScaledVector(_a.set(0,1,0).applyQuaternion(KIT.coil.quaternion), -S.stature*0.11);
  cableToPlug();
}
function plugAt(p, released){
  const gripW = CREW.placeTool(KIT.plug, p, _a.set(0,0.25,-1).normalize(), _b.set(1,0,0));
  if(!released) handTo("Right", gripW, CREW.toolShaft(KIT.plug,_c), UP, POLE_DOWN, 1);
  else handFree("Right");
  cableToPlug();
}
/* the live end of the cable always runs from the bus up to wherever the plug is */
const _cablePts = [];
function cableToPlug(){
  const b = KIT.branch[0];
  if(!b) return;
  const busY = HUMAN.groundW + S.H*0.020;
  const z = CFG.layout.wallZ + 16;
  const from = _e.set(CREW.wx(CREW.px(KIT.plug.position.x, CFG.layout.wallZ) - S.slotW*0.35,
                              CFG.layout.wallZ), busY, z);
  const to = _f.copy(KIT.plug.position);
  const pts = [];
  const n = 24;
  for(let i=0;i<n;i++){
    const t=i/(n-1);
    pts.push({ x:lerp(from.x,to.x,t), y:lerp(from.y,to.y,t) - Math.sin(Math.PI*t)*S.stature*0.09,
               z:lerp(from.z,to.z,t) + Math.sin(Math.PI*t)*S.stature*0.03 });
  }
  CREW.updateTube(b.mesh, pts, S.stature*0.015);
  b.mesh.visible = true;
}
/* Once a sign is live it keeps its own feed: a catenary from the floor bus up to its socket,
   frozen in place so the wall gradually fills with the wiring he has run. Branch 0 is
   reserved for the live end he is still holding. */
function connectBranch(s){
  const b = KIT.branch[s.i + 1];
  if(!b) return;
  const sock = socketW(s, _a).clone();
  const busY = HUMAN.groundW + S.H*0.020;
  const busP = V(CREW.wx(s.x - S.slotW*0.40, CFG.layout.wallZ), busY, CFG.layout.wallZ + 16);
  /* it leaves the socket downward, bellies out, and meets the floor run side-on — a straight
     line between the two reads as a scratch on the wall, not as a cable */
  const pts = [];
  const n = 24;
  const belly = S.stature*0.055;
  for(let i=0;i<n;i++){
    const t = i/(n-1);
    const e = t*t*(3-2*t);
    pts.push({ x:lerp(sock.x, busP.x, e) - Math.sin(Math.PI*t)*belly,
               y:lerp(sock.y, busP.y, t*t*(2-t)),
               z:lerp(sock.z, busP.z, e) + Math.sin(Math.PI*t)*S.stature*0.05 });
  }
  CREW.updateTube(b.mesh, pts, S.stature*0.016);
  b.mesh.visible = true;
  b.on = true;
  ST.busX = Math.max(ST.busX, s.x);
}
function dropBranch(s){
  const b = KIT.branch[s.i + 1];
  if(b){ b.mesh.visible = false; b.on = false; }
}

function updateBus(){
  if(!KIT.bus || !KIT.bus.visible) return;
  const busY = HUMAN.groundW + S.H*0.020;
  const z = CFG.layout.wallZ + 16;
  const x0 = CREW.wx(-S.W*0.12, CFG.layout.wallZ);
  const x1 = CREW.wx(Math.max(ST.busX, -S.W*0.10), CFG.layout.wallZ);
  const pts = [];
  const n = 48;
  for(let i=0;i<n;i++){
    const t=i/(n-1);
    pts.push({ x:lerp(x0,x1,t), y:busY + Math.sin(t*17+0.6)*S.stature*0.005, z });
  }
  CREW.updateTube(KIT.bus, pts, S.stature*0.015);
}

/* =====================================================================
   TICK
   ===================================================================== */
let PERSONA = PAINTER;

function evaluate(dt){
  const a = actAt(SHOW.t);
  SHOW.act = a;
  const k = a.dur > 0 ? clamp((SHOW.t - a.t0)/a.dur, 0, 1) : 1;
  SHOW.actK = k;
  SHOW.pass = a.pass || 0;

  /* --- where he is, and how fast --- */
  /* On the ground he stands beside the stepladder, not inside its footprint; climbing is
     what carries him across onto it. */
  const SIDE = S.stature*0.26;
  const lx = a.slot != null ? ladderXFor(a.slot) : 0;
  let x, speed;
  if(a.setX != null){ x = a.setX; speed = 0; }
  else if(a.x1 !== a.x0){
    x = lerp(a.x0, a.x1, easeIO(k));
    const de = (k < 0.5 ? 4*k : 4*(1-k));            // d/dk of easeIO
    speed = (a.x1-a.x0)*de/Math.max(1e-3, a.dur);
  }else{ x = a.x1; speed = 0; }
  if(a.slot != null){
    if(a.kind === "climb")        x = lerp(lx + SIDE, lx, easeIO(k));
    else if(a.kind === "descend") x = lerp(lx, lx + SIDE, easeIO(k));
    else if(a.kind === "setLadder" || a.kind === "kitUp" || a.kind === "kitDown") x = lx + SIDE;
    else if(a.kind !== "walk" && a.kind !== "shift") x = lx;
  }
  RIG.x = x; RIG.speed = speed; ST.speed = speed;
  RIG.z = CZ();
  if(a.slot != null) ST.ladderX = ladderXFor(a.slot);
  if(PERSONA === ELEC) ST.busX = Math.max(ST.busX, x);

  /* --- facing --- */
  const working = !(a.kind==="walk"||a.kind==="exit"||a.kind==="offstage"||a.kind==="wait"||a.kind==="shift");
  const want = working ? FACE_WORK : FACE_WALK;
  ST.faceY = a.kind === "offstage" ? want : approach(ST.faceY, want, 0.0009, dt);
  RIG.faceY = ST.faceY;

  /* --- gait --- */
  if(a.kind === "offstage") CREW.resetGait(x);
  const g = CREW.stepGait(dt, x, speed);
  RIG.gaitBob = g.bob; RIG.gaitSway = g.sway; RIG.gaitTwist = g.twist;

  RIG.crouch = approach(RIG.crouch, 0, 0.0004, dt);
  RIG.lean   = approach(RIG.lean, 0, 0.0015, dt);

  if(HUMAN.ready) stagePre(a, k, dt, g);
  if(g.contact && g.contact !== ST.lastContact && GROUND_ACTS[a.kind]){
    ST.lastContact = g.contact;
    if(Math.abs(speed) > 10){
      CREW.sfx.step(Math.abs(speed) > S.W*0.30);
      dustPuff(CREW.wx(g[g.contact].x, CZ()), HUMAN.groundW, CZ(), 2, S.stature*0.42);
    }
  }

  /* --- head follows the work --- */
  const s = a.slot != null ? SLOTS[a.slot] : null;
  if(s && working){
    CREW.slotPointW(s, 0.5, 0.5, 0, RIG.lookAt);
    RIG.looking = approach(RIG.looking, 1, 0.0025, dt);
  }else{
    RIG.lookAt.set(CREW.wx(RIG.x + (speed<0?-1:1)*S.W*0.30, CZ()),
                   HUMAN.groundW + S.stature*0.88, CZ()+60);
    RIG.looking = approach(RIG.looking, 0.5, 0.0025, dt);
  }

  handFree("Left"); handFree("Right");

  if(!HUMAN.ready){ if(PERSONA === ELEC) updateBus(); return; }
  CREW.poseBody(dt);
  PERSONA.apply(a, k, dt);
  CREW.poseArms(dt);
  dressBones();
  if(PERSONA === ELEC) updateBus();
}

const _hm = new T3.Vector3();
function dressBones(){
  const sc = S.stature;
  const head = HUMAN.B.Head;
  if(!head) return;
  head.updateWorldMatrix(true,false);
  /* only the electrician gets headgear: a cap vanished inside this character's hair, whereas
     a hard hat has to sit over it and reads instantly */
  if(PERSONA === ELEC){
    const hat = KIT.helmet;
    hat.visible = true;
    hat.scale.setScalar(sc);
    head.getWorldPosition(_hm);
    head.getWorldQuaternion(hat.quaternion);
    hat.position.copy(_hm).addScaledVector(_a.set(0,1,0).applyQuaternion(hat.quaternion), sc*0.105);
  }

  if(PERSONA === ELEC){
    const hips = HUMAN.B.Hips;
    hips.updateWorldMatrix(true,false);
    hips.getWorldPosition(_hm);
    hips.getWorldQuaternion(KIT.coil.quaternion);
    KIT.coil.scale.setScalar(sc);
    KIT.coil.position.copy(_hm)
      .addScaledVector(_a.set(1,0,0).applyQuaternion(KIT.coil.quaternion), -sc*0.11)
      .addScaledVector(_b.set(0,1,0).applyQuaternion(KIT.coil.quaternion), -sc*0.02);
  }
}

/* =====================================================================
   THEME
   ===================================================================== */
let themeTarget = 0, themeCur = 0;
function setTheme(name, instant){
  S.theme = name;
  document.documentElement.setAttribute("data-theme", name);
  themeTarget = name === "dark" ? 1 : 0;
  if(instant){ themeCur = themeTarget; CREW.setThemeMix(themeCur); }
  PERSONA = name === "dark" ? ELEC : PAINTER;
  PERSONA.dress();
  CREW.slotsApplyTheme(name === "dark");
  buildSchedule(PERSONA === ELEC ? "electrician" : "painter");
  resetWorld();
  for(const b of document.querySelectorAll(".th"))
    b.setAttribute("aria-checked", b.dataset.theme === name ? "true" : "false");
}
CREW.setTheme = setTheme;

function resetWorld(){
  SHOW.t = 0;
  ST.climb = 0; ST.busX = -S.W*0.10; ST.kitOn = "hand";
  ST.faceY = FACE_WALK; ST.lastHandX = null;
  ST.kettleSwing.x = ST.kettleSwing.vx = 0;
  ST.lampTarget.set(0, 0, CFG.layout.wallZ);
  CREW.killParticles();
  CREW.clearDecals();
  for(const b of (KIT.branch||[])){ b.mesh.visible=false; b.on=false; }
  resetSlots();
  CREW.resetGait(-S.W*0.18);
}
function resetSlots(){
  for(const a of SHOW.acts){ a.__thud=a.__set=a.__dipSfx=a.__unp=a.__plugged=a.__sparked=a.__swapped=0; }
  for(const s of SLOTS){
    if(!s.active) continue;
    CREW.slotReset(s);
    s.__layerAct=null; s.__done=0; s.__dripArmed=0;
    s.panel.rotation.y = 0;
    s.paintMesh.scale.set(s.wW, s.hW, 1);
    if(S.theme === "dark") CREW.slotSetSign(s, DATA[s.i % DATA.length]);
  }
}

/* =====================================================================
   MAIN LOOP
   ===================================================================== */
let last = performance.now(), acc = 0, ready = false;
const FIXED = 1/60;
const beatEl  = document.getElementById("beat");
const scrubEl = document.getElementById("scrub");

function frame(now){
  requestAnimationFrame(frame);
  let dt = (now-last)/1000; last = now;
  dt = Math.min(dt, 1/20);
  if(!ready) return;
  if(SHOW.playing){
    acc += dt*CFG.pace;
    let n = 0;
    while(acc >= FIXED && n < 4){ tick(FIXED); acc -= FIXED; n++; }
    if(n === 4) acc = 0;
  }
  CREW.renderer.render(CREW.scene, CREW.camera);
}

function tick(dt){
  CREW.T += dt;
  SHOW.t += dt;
  if(SHOW.t >= SHOW.dur){ SHOW.t -= SHOW.dur; resetSlots(); ST.busX = -S.W*0.10;
                          CREW.clearDecals();
                          for(const b of (KIT.branch||[])){ b.mesh.visible=false; b.on=false; } }
  themeCur = approach(themeCur, themeTarget, 0.004, Math.max(dt, 1/240));
  CREW.setThemeMix(themeCur);
  evaluate(Math.max(dt, 1e-4));
  CREW.stepSlots(Math.max(dt, 1e-4));
  CREW.stepParticles(Math.max(dt, 1e-4));
  updateUI(dt);
}

/* replay from zero — the wall is a cumulative thing, so a scrub has to rebuild it */
function seek(t){
  const upto = clamp(t, 0, SHOW.dur - 1e-3);
  resetSlots();
  ST.busX = -S.W*0.10; ST.climb = 0; ST.faceY = FACE_WALK; ST.lastHandX = null;
  CREW.killParticles(); CREW.clearDecals();
  SHOW.t = 0;
  const st = 1/60;
  let guard = 0;
  while(SHOW.t < upto && guard++ < 8000){
    SHOW.t = Math.min(upto, SHOW.t + st);
    evaluate(st);
    CREW.stepSlots(st);
  }
}
CREW.seek = seek;

let uiT = 0;
const BEAT = { walk:"walking on", exit:"walking off", shift:"moving the ladder",
  setLadder:"setting the ladder down", lift:"picking the ladder up",
  kitUp:"kit onto the shelf", kitDown:"kit off the shelf", climb:"climbing",
  descend:"climbing down", dip:"loading the brush", stroke:"painting",
  admire:"checking the work", wait:"off stage", offstage:"off stage",
  plugin:"plugging in", charge:"energising", unplug:"pulling the plug",
  dieout:"flickering out", spin:"turning the sign" };
function updateUI(dt){
  uiT += dt;
  if(uiT < 0.12) return;
  uiT = 0;
  if(scrubEl && document.activeElement !== scrubEl)
    scrubEl.value = Math.round(SHOW.t/SHOW.dur*1000);
  if(beatEl && SHOW.act)
    beatEl.textContent = `${SHOW.t.toFixed(1)}s / ${SHOW.dur.toFixed(1)}s · ${BEAT[SHOW.act.kind]||SHOW.act.kind}`;
}

/* =====================================================================
   BOOT
   ===================================================================== */
function announce(){
  const list = document.getElementById("srList");
  const fb   = document.getElementById("fallbackList");
  if(list){
    list.innerHTML = "";
    for(const d of DATA){ const li=document.createElement("li"); li.textContent=d.name; list.appendChild(li); }
  }
  if(fb) fb.textContent = DATA.map(d=>d.name).join(" · ");
}

function build(){
  if(!CREW.layout()) return false;
  if(!KIT.ladder) buildKit();
  if(HUMAN.ready){
    CREW.placeHuman();
    CREW.S.armLen = HUMAN.armLen; CREW.S.shoulderY = HUMAN.shoulderY;
    CREW.layout();
    CREW.placeHuman();
  }
  CREW.buildSlots();
  setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", true);
  ready = true;
  for(let i=0;i<6;i++) tick(FIXED);      // settle the springs before the first painted frame
  SHOW.t = 0;
  return true;
}

CREW.onHumanReady = function(){
  /* the layout depends on his measured arm, and his scale depends on the layout, so it takes
     two passes to settle */
  CREW.placeHuman();
  CREW.S.armLen = HUMAN.armLen;
  CREW.S.shoulderY = HUMAN.shoulderY;
  if(!ready){ build(); return; }
  CREW.layout();
  CREW.placeHuman();
  CREW.buildSlots();
  CREW.slotsApplyTheme(S.theme === "dark");
  buildSchedule(PERSONA === ELEC ? "electrician" : "painter");
  resetWorld();
};

announce();
build();
requestAnimationFrame(frame);

let rzT;
new ResizeObserver(() => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    const frac = SHOW.dur ? SHOW.t/SHOW.dur : 0;
    if(!CREW.layout()) return;
    if(HUMAN.ready){ CREW.placeHuman(); CREW.S.armLen = HUMAN.armLen;
                     CREW.S.shoulderY = HUMAN.shoulderY; CREW.layout(); }
    CREW.buildSlots();
    CREW.slotsApplyTheme(S.theme === "dark");
    if(HUMAN.ready) CREW.placeHuman();
    buildSchedule(PERSONA === ELEC ? "electrician" : "painter");
    resetWorld();
    SHOW.t = frac*SHOW.dur;
    ready = true;
  }, 140);
}).observe(CREW.stage);

/* ---------- controls ---------- */
for(const b of document.querySelectorAll(".th"))
  b.addEventListener("click", () => setTheme(b.dataset.theme));

const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  const on = soundBtn.getAttribute("aria-pressed") !== "true";
  soundBtn.setAttribute("aria-pressed", on ? "true":"false");
  soundBtn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
  CREW.audioEnable(on);
});
const playBtn = document.getElementById("playBtn");
playBtn.addEventListener("click", () => {
  SHOW.playing = !SHOW.playing;
  playBtn.setAttribute("aria-pressed", SHOW.playing ? "true":"false");
  playBtn.setAttribute("aria-label", SHOW.playing ? "Pause" : "Play");
});
const speedEl = document.getElementById("speed"), speedOut = document.getElementById("speedOut");
speedEl.addEventListener("input", () => {
  CFG.pace = speedEl.value/100;
  speedOut.textContent = CFG.pace.toFixed(1)+"×";
});
scrubEl.addEventListener("input", () => { seek(scrubEl.value/1000*SHOW.dur); });

/* the character arrives asynchronously; the wall builds itself without him until then */
try{
  const bin = Uint8Array.from(atob(window.__PULLER_GLB_B64), c => c.charCodeAt(0)).buffer;
  new THREE.GLTFLoader().parse(bin, "", CREW.initHuman,
    err => console.error("[logo-crew] character failed to load", err));
}catch(err){ console.error("[logo-crew] character data missing", err); }

/* handle for 1:1 crop review */
window.__crew = {
  CREW, SHOW, KIT, ST, RIG, HUMAN, SLOTS, PAINTER, ELEC,
  seek(t){ seek(t); CREW.renderer.render(CREW.scene, CREW.camera); },
  step(n){ for(let i=0;i<(n||1);i++) tick(FIXED); CREW.renderer.render(CREW.scene, CREW.camera); },
  info(){ return { tris:CREW.renderer.info.render.triangles, calls:CREW.renderer.info.render.calls,
                   dur:+SHOW.dur.toFixed(2), t:+SHOW.t.toFixed(2),
                   act:SHOW.act && SHOW.act.kind, theme:S.theme, ready, human:HUMAN.ready,
                   reachTop:Math.round(S.reachTop), rowY:Math.round(S.rowY),
                   topReach:Math.round(S.topReach||0), headClears:S.headClears,
                   armLen:Math.round(S.armLen||0),
                   stature:Math.round(S.stature), slotW:Math.round(S.slotW) }; },
};
})();
