/* =====================================================================
   LOGO CREW — rig
   A real rigged humanoid (glTF skeleton, Mixamo naming) posed entirely in code: there are no
   baked clips in the GLB, so the walk, the carry, the climb and every reach are solved here.

   Two-phase on purpose. poseBody() sets hips, spine, head and legs and flushes the world
   matrices; the show then reads the resulting shoulder/hand positions to work out where the
   props must be; poseArms() solves the arms onto those. Doing it in one pass means aiming an
   arm at a target derived from last frame's shoulder, which is exactly how a carried prop
   ends up swimming an inch off the hand.
   ===================================================================== */
(function(){
"use strict";
const CREW = window.CREW;
if(!CREW || CREW.dead) return;
const T3 = THREE;
const { clamp, lerp, easeIO, easeOut, approach, hash, CFG, S, vx, vy } = CREW;

const HUMAN = CREW.HUMAN = {
  ready:false, root:null, B:{}, rest:{}, bind:null, restHip:null,
  scale:1, armLen:0, legLen:0, palmLen:0,
  meshes:[],
};

/* what the show writes each frame */
const RIG = CREW.RIG = {
  x:0, y:0, z:0,
  faceY:Math.PI/2,
  speed:0,
  lean:0,               // extra forward lean, radians
  crouch:0,             // 0..1
  hipLift:0,            // world units the hips are raised (climbing)
  hipBack:0,
  foot:{ Left:{x:0,y:0,z:0,lift:0,level:0.92,pole:null}, Right:{x:0,y:0,z:0,lift:0,level:0.92,pole:null} },
  hand:{ Left:{active:false,pos:new T3.Vector3(),quat:new T3.Quaternion(),pole:new T3.Vector3(),swing:0},
         Right:{active:false,pos:new T3.Vector3(),quat:new T3.Quaternion(),pole:new T3.Vector3(),swing:0} },
  lookAt:new T3.Vector3(), looking:0,
  effort:0,
  gait:0, gaitBob:0, gaitSway:0, gaitTwist:0,
};

/* =====================================================================
   IK PRIMITIVES  (analytic two-bone, so no twist can creep into an ankle or wrist)
   ===================================================================== */
const UPV = new T3.Vector3(0,1,0);
const _hangT = new T3.Vector3(), _hangP = new T3.Vector3();
const LIMB = { p:new T3.Vector3(), u:new T3.Vector3(), n:new T3.Vector3(), k:new T3.Vector3(),
               d:new T3.Vector3(), q:new T3.Quaternion(), pq:new T3.Quaternion(), cur:new T3.Quaternion() };
const _v = new T3.Vector3(), _v2 = new T3.Vector3(), _q = new T3.Quaternion(),
      _axis = new T3.Vector3(), _m = new T3.Matrix4();

function bonePos(b, out){ b.updateWorldMatrix(true,false); return out.setFromMatrixPosition(b.matrixWorld); }
CREW.bonePos = bonePos;

function captureBind(names){
  if(!HUMAN.bind) HUMAN.bind = {};
  for(const n of names){
    if(HUMAN.bind[n]) continue;
    const b = HUMAN.B[n];
    if(!b) continue;
    const child = b.children.find(c => c.isBone) || b.children[0];
    b.updateWorldMatrix(true,false);
    const bp = new T3.Vector3().setFromMatrixPosition(b.matrixWorld);
    const q  = b.getWorldQuaternion(new T3.Quaternion());
    let axis = new T3.Vector3(0,1,0), len = 1;
    if(child){
      child.updateWorldMatrix(true,false);
      const cp = new T3.Vector3().setFromMatrixPosition(child.matrixWorld);
      axis = cp.clone().sub(bp);
      len = axis.length() || 1;
      axis.divideScalar(len);
    }
    HUMAN.bind[n] = { q, axis, len };
  }
}
function setBoneWorldQuat(bone, qW){
  bone.parent.getWorldQuaternion(LIMB.pq).invert();
  bone.quaternion.copy(LIMB.pq.multiply(qW));
  bone.updateWorldMatrix(false,false);
}
function aimBone(name, dirW){
  const bind = HUMAN.bind[name], b = HUMAN.B[name];
  if(!bind || !b) return;
  setBoneWorldQuat(b, LIMB.q.setFromUnitVectors(bind.axis, dirW).multiply(bind.q));
}
/* targetW: world position for the tip. breakDir: which way the joint folds. */
function solveLimb(rootName, midName, tipName, targetW, breakDir, levelWeight){
  const bindR = HUMAN.bind[rootName], bindM = HUMAN.bind[midName];
  const rootB = HUMAN.B[rootName];
  if(!bindR || !bindM || !rootB) return;
  rootB.updateWorldMatrix(true,false);
  LIMB.p.setFromMatrixPosition(rootB.matrixWorld);
  const L1 = bindR.len, L2 = bindM.len;
  LIMB.u.copy(targetW).sub(LIMB.p);
  let d = LIMB.u.length() || 1e-4;
  LIMB.u.divideScalar(d);
  d = clamp(d, Math.abs(L1-L2)+1e-3, L1+L2-1e-3);
  const a = (d*d + L1*L1 - L2*L2)/(2*d);
  const h = Math.sqrt(Math.max(0, L1*L1 - a*a));
  LIMB.n.copy(breakDir).addScaledVector(LIMB.u, -breakDir.dot(LIMB.u));
  if(LIMB.n.lengthSq() < 1e-6) LIMB.n.set(0,0,1);
  LIMB.n.normalize();
  LIMB.k.copy(LIMB.p).addScaledVector(LIMB.u, a).addScaledVector(LIMB.n, h);
  aimBone(rootName, LIMB.d.copy(LIMB.k).sub(LIMB.p).normalize());
  aimBone(midName,  LIMB.d.copy(targetW).sub(LIMB.k).normalize());
  const tip = HUMAN.B[tipName], bindT = HUMAN.bind[tipName];
  if(tip && bindT && levelWeight > 0){
    tip.getWorldQuaternion(LIMB.cur);
    setBoneWorldQuat(tip, LIMB.cur.slerp(bindT.q, levelWeight));
  }
}
CREW.solveLimb = solveLimb;
CREW.setBoneWorldQuat = setBoneWorldQuat;

/* ---- hands ---------------------------------------------------------
   The IK aims the WRIST, but what has to land on a handle is the PALM, a whole hand-length
   further on. Capture the hand's own axes at bind, then build the orientation that lays a
   given shaft across the palm and offset the wrist target back down the fingers axis.       */
const HAND = { ready:false, xL:{}, yL:{}, zL:{}, palm:{},
               mW:new T3.Matrix4(), mL:new T3.Matrix4(),
               x:new T3.Vector3(), y:new T3.Vector3(), z:new T3.Vector3(), v:new T3.Vector3() };
function captureHandBind(){
  if(HAND.ready) return;
  for(const side of ["Left","Right"]){
    const h=HUMAN.B[side+"Hand"], mid=HUMAN.B[side+"HandMiddle1"],
          idx=HUMAN.B[side+"HandIndex1"], pky=HUMAN.B[side+"HandPinky1"];
    if(!h||!mid||!idx||!pky) return;
    for(const b of [h,mid,idx,pky]) b.updateWorldMatrix(true,false);
    const hp=new T3.Vector3().setFromMatrixPosition(h.matrixWorld);
    const mp=new T3.Vector3().setFromMatrixPosition(mid.matrixWorld);
    const ip=new T3.Vector3().setFromMatrixPosition(idx.matrixWorld);
    const pp=new T3.Vector3().setFromMatrixPosition(pky.matrixWorld);
    const inv=h.getWorldQuaternion(new T3.Quaternion()).invert();
    const xW=mp.clone().sub(hp); const palm=xW.length()||1; xW.divideScalar(palm);
    const zW=ip.clone().sub(pp).normalize();
    HAND.xL[side]=xW.clone().applyQuaternion(inv).normalize();
    HAND.zL[side]=zW.clone().applyQuaternion(inv).normalize();
    HAND.yL[side]=new T3.Vector3().crossVectors(HAND.zL[side], HAND.xL[side]).normalize();
    HAND.palm[side]=palm;
  }
  HAND.ready = true;
  HUMAN.palmLen = HAND.palm.Right || 0;
}
/* a shaft lying across the palm, fingers curling around it.
   upHint biases which way the back of the hand faces. */
function handGripQuat(side, shaftW, upHint, out){
  HAND.z.copy(shaftW).normalize();
  HAND.x.copy(upHint || _v.set(0,0,1)).cross(HAND.z);
  if(HAND.x.lengthSq() < 1e-6){ HAND.x.set(1,0,0).cross(HAND.z); }
  if(HAND.x.lengthSq() < 1e-6) HAND.x.set(1,0,0);
  HAND.x.normalize();
  HAND.y.crossVectors(HAND.z, HAND.x).normalize();
  HAND.mW.makeBasis(HAND.x, HAND.y, HAND.z);
  HAND.mL.makeBasis(HAND.xL[side], HAND.yL[side], HAND.zL[side]).transpose();
  return out.setFromRotationMatrix(HAND.mW.multiply(HAND.mL));
}
CREW.handGripQuat = handGripQuat;
CREW.handsReady = () => HAND.ready && HUMAN.ready;
CREW.palmLen = side => HAND.palm[side] || 0;
CREW.handAxis = side => HAND.xL[side];

const _fq = new T3.Quaternion(), _fz = new T3.Vector3(0,0,1);
function setGrip(side, closed, thumbOut){
  const dir = side==="Left" ? -1 : 1;
  for(const f of ["Thumb","Index","Middle","Ring","Pinky"]){
    for(let j=1;j<=3;j++){
      const key = `${side}Hand${f}${j}`;
      const b = HUMAN.B[key];
      if(!b) continue;
      let bend = (f==="Thumb" ? 0.58 : (j===1 ? 1.02 : 1.28)) * (0.14 + 0.86*closed);
      if(f==="Thumb" && thumbOut) bend *= 0.35;
      b.quaternion.copy(HUMAN.rest[key]).multiply(_fq.setFromAxisAngle(_fz, dir*bend));
    }
  }
}
CREW.setGrip = setGrip;
const gripS = CREW.gripS = { Left:1, Right:1 };

/* =====================================================================
   LOAD
   ===================================================================== */
CREW.initHuman = function(gltf){
  const root = gltf.scene;
  root.traverse(o => {
    if(o.isMesh || o.isSkinnedMesh){
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      HUMAN.meshes.push(o);
      const m = o.material;
      if(m){ m.roughness = 0.90; m.metalness = 0.0; m.envMapIntensity = 0.5; }
    }
    if(o.isBone) HUMAN.B[o.name.replace(/^mixamorig/,"")] = o;
  });
  for(const k in HUMAN.B) HUMAN.rest[k] = HUMAN.B[k].quaternion.clone();
  HUMAN.restHip = HUMAN.B.Hips.position.clone();
  HUMAN.root = root;
  CREW.scene.add(root);

  /* attachment points that ride bones */
  HUMAN.headMount  = new T3.Group();  HUMAN.B.Head.add(HUMAN.headMount);
  HUMAN.chestMount = new T3.Group();  (HUMAN.B.Spine2 || HUMAN.B.Spine1).add(HUMAN.chestMount);
  HUMAN.hipMount   = new T3.Group();  HUMAN.B.Hips.add(HUMAN.hipMount);

  setGrip("Left",1); setGrip("Right",1);
  HUMAN.ready = true;
  if(CREW.onHumanReady) CREW.onHumanReady();
};

/* scale him to the stage and measure the limbs off the rig rather than guessing */
CREW.placeHuman = function(){
  if(!HUMAN.ready) return;
  const r = HUMAN.root;
  RIG.z = CFG.layout.charZ;
  /* he is nearer the camera than the wall, so his world height is his apparent height
     scaled by the perspective factor at his own depth */
  HUMAN.scale = (S.stature * CREW.kAt(RIG.z)) / 1.66;   // the source rig stands ~1.66 tall
  r.scale.setScalar(HUMAN.scale);
  r.rotation.set(0, RIG.faceY, 0);
  r.position.set(CREW.wx(RIG.x, RIG.z), CREW.wy(S.groundY, RIG.z), RIG.z);
  r.updateMatrixWorld(true);
  const sh = bonePos(HUMAN.B.LeftArm, _v).clone();
  const hd = bonePos(HUMAN.B.LeftHand, _v2).clone();
  HUMAN.armLen = sh.distanceTo(hd);
  const hip = bonePos(HUMAN.B.LeftUpLeg, _v).clone();
  const ft  = bonePos(HUMAN.B.LeftFoot, _v2).clone();
  HUMAN.legLen = hip.distanceTo(ft);
  HUMAN.groundW = CREW.wy(S.groundY, RIG.z);
  HUMAN.hipH   = hip.y - HUMAN.groundW;
  HUMAN.shoulderY = sh.y - HUMAN.groundW;
  /* the bone-space unit the hip offsets are expressed in (Mixamo hips sit near y=100) */
  HUMAN.hipUnit = Math.abs(HUMAN.restHip.y) || 1;
  captureBind(["LeftArm","LeftForeArm","LeftHand","RightArm","RightForeArm","RightHand",
               "LeftUpLeg","LeftLeg","LeftFoot","RightUpLeg","RightLeg","RightFoot"]);
  captureHandBind();
};

/* =====================================================================
   GAIT
   Foot placement is world-locked: a foot picks a spot when it lands and stays there until it
   swings again, so the ground never slides under him however the pace changes.
   ===================================================================== */
const GAIT = CREW.GAIT = {
  phase:0,
  prev:{ Left:0.5, Right:0 },
  plant:{ Left:null, Right:null },
  from:{ Left:0, Right:0 },
  to:{ Left:0, Right:0 },
  offset:{ Left:0.5, Right:0 },
  contactCB:null,
};
CREW.resetGait = function(x){
  GAIT.phase = 0;
  for(const s of ["Left","Right"]){
    GAIT.plant[s] = x + (s==="Left" ? 1 : -1)*S.stature*CFG.walk.strideOf*0.25;
    GAIT.from[s] = GAIT.to[s] = GAIT.plant[s];
    GAIT.prev[s] = GAIT.offset[s];
  }
};
/* speed is signed stage px/s; dir is +1 / -1 facing */
CREW.stepGait = function(dt, x, speed){
  const stride = S.stature * CFG.walk.strideOf;
  const moving = Math.abs(speed) > 4;
  if(moving) GAIT.phase += Math.abs(speed)*dt / (stride*2);
  else       GAIT.phase += dt*0.30;          // idle: barely turning over, for weight shifts
  GAIT.phase %= 1;

  const SW = CFG.walk.swing;
  const dir = Math.sign(speed) || 1;
  const out = { Left:null, Right:null, bob:0, sway:0, twist:0, contact:null };

  for(const side of ["Left","Right"]){
    const p = (GAIT.phase + GAIT.offset[side]) % 1;
    if(p < GAIT.prev[side]){
      /* just entered swing: pick where this foot is going to land */
      GAIT.from[side] = GAIT.plant[side];
      GAIT.to[side]   = x + dir*stride*(moving ? 0.62 : 0.16) + (side==="Left" ? 0 : 0);
      if(!moving) GAIT.to[side] = GAIT.from[side];
    }
    GAIT.prev[side] = p;

    let lift = 0;
    if(p < SW && moving){
      const k = easeIO(p/SW);
      GAIT.plant[side] = lerp(GAIT.from[side], GAIT.to[side], k);
      lift = Math.sin(Math.PI*k)*S.stature*CFG.walk.lift;
    }else{
      if(p >= SW && GAIT.plant[side] !== GAIT.to[side] && moving){
        GAIT.plant[side] = GAIT.to[side];
        out.contact = side;                       // heel strike, for the footstep sound
      }
      lift = 0;
    }
    out[side] = { x:GAIT.plant[side], lift };
  }
  /* two bobs and one sway per cycle */
  const m = moving ? 1 : 0.18;
  out.bob   = (-Math.cos(GAIT.phase*4*Math.PI)*0.5+0.5) * S.stature*CFG.walk.bob * m;
  out.sway  = Math.sin(GAIT.phase*2*Math.PI) * S.stature*CFG.walk.sway * m;
  out.twist = Math.sin(GAIT.phase*2*Math.PI) * 0.13 * m;
  return out;
};

/* =====================================================================
   POSE — body
   ===================================================================== */
const BODY_BONES = ["Hips","Spine","Spine1","Spine2","Neck","Head",
                    "LeftShoulder","LeftArm","LeftForeArm","LeftHand",
                    "RightShoulder","RightArm","RightForeArm","RightHand",
                    "LeftUpLeg","LeftLeg","LeftFoot","RightUpLeg","RightLeg","RightFoot"];
let breathT = 0;

CREW.poseBody = function(dt){
  if(!HUMAN.ready) return;
  const B = HUMAN.B, R = HUMAN.rest;
  breathT += dt;

  const r = HUMAN.root;
  r.scale.setScalar(HUMAN.scale);
  r.rotation.set(0, RIG.faceY, 0);
  r.position.set(CREW.wx(RIG.x, RIG.z), HUMAN.groundW + RIG.hipLift, RIG.z);

  for(const k of BODY_BONES) if(B[k]) B[k].quaternion.copy(R[k]);

  const U = HUMAN.hipUnit;
  const speedN = clamp(Math.abs(RIG.speed)/(S.W*CFG.walk.speed), 0, 1.3);

  /* --- hips --- */
  B.Hips.position.copy(HUMAN.restHip);
  B.Hips.position.y -= U * (RIG.gaitBob / Math.max(1,S.stature)) * 1.66;
  B.Hips.position.y -= U * 0.30 * RIG.crouch;
  B.Hips.position.z -= U * (0.20*RIG.crouch + RIG.hipBack);
  B.Hips.position.y += U * 0.006 * Math.sin(breathT*1.5);
  /* sway is lateral in the character's own frame; +X local is his left/right */
  B.Hips.position.x += U * (RIG.gaitSway / Math.max(1,S.stature)) * 1.66;
  B.Hips.quaternion.copy(R.Hips)
    .multiply(_q.setFromAxisAngle(_axis.set(0,1,0), RIG.gaitTwist))
    .multiply(_q.setFromAxisAngle(_axis.set(1,0,0), 0.30*RIG.crouch));

  /* --- spine: lean spread over three joints --- */
  const lean = -(CFG.walk.lean*speedN + RIG.lean + 0.55*RIG.crouch);
  const breath = Math.sin(breathT*1.5)*0.020;
  for(const [k,w] of [["Spine",1.0],["Spine1",0.82],["Spine2",0.62]]){
    if(!B[k]) continue;
    B[k].quaternion.copy(R[k])
      .multiply(_q.setFromAxisAngle(_axis.set(1,0,0), lean*w + breath*w))
      .multiply(_q.setFromAxisAngle(_axis.set(0,1,0), -RIG.gaitTwist*0.55*w))
      .multiply(_q.setFromAxisAngle(_axis.set(0,0,1), Math.sin(breathT*0.7)*0.012*w));
  }
  if(B.Neck) B.Neck.quaternion.copy(R.Neck)
    .multiply(_q.setFromAxisAngle(_axis.set(1,0,0), -lean*0.45 + 0.06));

  HUMAN.root.updateMatrixWorld(true);

  /* --- head: turn toward whatever he is working on --- */
  if(B.Head && RIG.looking > 0.01){
    const hp = bonePos(B.Head, _v).clone();
    const dir = _v2.copy(RIG.lookAt).sub(hp).normalize();
    /* express the look direction in the head's parent frame and blend toward it */
    const parentQ = B.Head.parent.getWorldQuaternion(_q).clone();
    const local = dir.clone().applyQuaternion(parentQ.clone().invert());
    /* the rig's head looks along +Z locally */
    const want = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0,0,1), local);
    const limited = R.Head.clone().slerp(want, clamp(RIG.looking,0,1)*0.62);
    B.Head.quaternion.copy(limited);
    HUMAN.root.updateMatrixWorld(true);
  }

  /* --- legs --- */
  for(const side of ["Left","Right"]){
    const f = RIG.foot[side];
    if(!B[side+"UpLeg"]) continue;
    _v.set(f.x, f.y - f.lift, f.z);
    const pole = f.pole || _v2.set(0, 0.15, 1).normalize();
    solveLimb(side+"UpLeg", side+"Leg", side+"Foot", _v, pole, f.level);
  }
  HUMAN.root.updateMatrixWorld(true);
};

/* =====================================================================
   POSE — arms
   Hands with an active target are solved onto it; the rest swing with the gait.
   ===================================================================== */
CREW.poseArms = function(dt){
  if(!HUMAN.ready || !HAND.ready) return;
  const B = HUMAN.B, R = HUMAN.rest;
  const speedN = clamp(Math.abs(RIG.speed)/(S.W*CFG.walk.speed), 0, 1.2);

  for(const side of ["Left","Right"]){
    const h = RIG.hand[side];
    const arm = B[side+"Arm"];
    if(!arm) continue;

    if(!h.active){
      /* A free arm is solved onto a hanging target rather than nudged off the rest pose:
         this rig's rest pose is a T, so rest-relative tweaks leave the arms straight out.
         IK to a point beside the hip is bind-pose-agnostic and swings with the gait. */
      const sh = bonePos(B[side+"Arm"], _v).clone();
      const ph  = (GAIT.phase + (side==="Left" ? 0 : 0.5)) % 1;
      const sw  = Math.sin(ph*2*Math.PI) * (0.55*speedN + 0.06);
      const fwd = _v2.set(Math.sin(RIG.faceY), 0, Math.cos(RIG.faceY));
      const lft = _axis.set(Math.cos(RIG.faceY), 0, -Math.sin(RIG.faceY));
      const dir = side === "Left" ? 1 : -1;
      const L = HUMAN.armLen * 0.96;
      _hangT.copy(sh)
        .addScaledVector(UPV, -L*(0.94 - 0.10*Math.abs(sw)))
        .addScaledVector(fwd,  L*sw)
        .addScaledVector(lft,  dir*L*(0.15 + 0.05*speedN));
      _hangP.copy(fwd).multiplyScalar(-0.55).addScaledVector(lft, dir*0.35)
             .add(_v.set(0,-0.4,0)).normalize();
      solveLimb(side+"Arm", side+"ForeArm", side+"Hand", _hangT, _hangP, 0.75);
      gripS[side] = approach(gripS[side], 0.26, 0.004, dt);
      setGrip(side, gripS[side], true);
      continue;
    }

    /* the palm has to land on the target, so pull the wrist back down the fingers axis */
    HAND.v.copy(HAND.xL[side]).applyQuaternion(h.quat).multiplyScalar(HAND.palm[side]);
    _v.copy(h.pos).sub(HAND.v);
    solveLimb(side+"Arm", side+"ForeArm", side+"Hand", _v, h.pole, 0);
    setBoneWorldQuat(B[side+"Hand"], h.quat);
    gripS[side] = approach(gripS[side], h.grip != null ? h.grip : 1, 0.0006, dt);
    setGrip(side, gripS[side], false);
  }
  HUMAN.root.updateMatrixWorld(true);
};

/* =====================================================================
   TOOL PLACEMENT
   Aim the TOOL, then derive where the hand has to be — never the other way round.
     tipW  : world position the working end must occupy
     aimW  : unit vector from grip toward tip
     rollW : a reference "up" for the roll about the shaft (e.g. the wall normal)
   Returns the world position of the tool's grip point, ready to hand to the arm IK.
   ===================================================================== */
const _tq = new T3.Quaternion(), _tm = new T3.Matrix4(),
      _ax = new T3.Vector3(), _ay = new T3.Vector3(), _az = new T3.Vector3();
CREW.placeTool = function(tool, tipW, aimW, rollW, gripKey){
  const sc = S.stature;
  tool.scale.setScalar(sc);
  _ay.copy(aimW).normalize();
  _az.copy(rollW || _v.set(0,0,1));
  _ax.crossVectors(_ay, _az);
  if(_ax.lengthSq() < 1e-7){ _az.set(1,0,0); _ax.crossVectors(_ay,_az); }
  _ax.normalize();
  _az.crossVectors(_ax, _ay).normalize();
  _tm.makeBasis(_ax, _ay, _az);
  _tq.setFromRotationMatrix(_tm);
  tool.quaternion.copy(_tq);
  const tip = tool.userData.tip || new T3.Vector3();
  _v.copy(tip).multiplyScalar(sc).applyQuaternion(_tq);
  tool.position.copy(tipW).sub(_v);
  const g = tool.userData[gripKey || "grip"] || new T3.Vector3();
  _v2.copy(g).multiplyScalar(sc).applyQuaternion(_tq);
  return _v2.add(tool.position);       // world grip point
};
/* the shaft direction of a placed tool, in world */
CREW.toolShaft = function(tool, out){
  return (out||new T3.Vector3()).set(0,1,0).applyQuaternion(tool.quaternion).normalize();
};
/* world position of an arbitrary local point on a placed tool */
CREW.toolPoint = function(tool, local, out){
  return (out||new T3.Vector3()).copy(local).multiplyScalar(S.stature)
    .applyQuaternion(tool.quaternion).add(tool.position);
};

/* handy: where a bone is, in world */
CREW.boneAt = function(name, out){
  const b = HUMAN.B[name];
  if(!b) return (out||new T3.Vector3()).set(0,0,0);
  return bonePos(b, out||new T3.Vector3()).clone();
};

})();
