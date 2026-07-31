# Paint-Logo

A simple experiment on how can we show logos on webpages apart from make them boring or an
infinite marquee.

Ten client logos, five at a time, put up by hand by a rigged 3D character who has to carry
their own ladder. Open `index.html` by double-clicking it — no build step, no server, no
network.

**Live demo:** https://mehedihasan27.github.io/Paint-Logo/

---

## The two shows

**Light theme — the painter.** She walks on carrying a stepladder in one hand and a paint
kettle in the other, sets the ladder down under the first slot, puts the kettle on its top
platform, climbs, loads the brush, and brushes the logo onto the wall. Down, pick everything
up, two steps along, repeat. After the fifth she walks off, and the wall keeps what she
painted. Second pass: she rolls a coat of off-white over the old mark and paints the next
company straight on top of it, exactly like a real painted sign — the old one is still under
there, ghosting through at the edges.

**Dark theme — the electrician.** The wall starts black. He carries a work lamp and a coil of
cable; the lamp is a real `SpotLight`, so the signs are invisible until its cone falls on
them. At each slot he hooks the lamp on the ladder, climbs, and pushes a plug into the
socket: spark, and the charge crawls out through the tube until the whole sign is lit — and
it stays lit after he has moved on. Second pass: pull the plug, the tube stutters out, the
panel rotates on its mount to the next company, plug back in.

Both run off one rig, one gait, and one schedule builder. The beat sheet is identical —
walk, set the ladder down, kit onto the shelf, climb, work, come down, pick up — which is
what makes the personas swappable rather than two separate animations.

---

## What is actually simulated

Nothing here is a timed CSS wipe with a character animation playing next to it. The coupling
is real in both directions:

- **The reveal is stamped at the brush tip.** Each slot owns a small canvas: the logo
  artwork on one layer, its *coverage* on another. Every frame the brush's footprint — a
  flat ferrule with individual bristle lines — is stamped into the coverage mask at wherever
  the tip actually is. If the hand stops, the paint stops. Stamps are interpolated between
  frames, so at 30fps it lays down more stamps rather than leaving gaps.
- **The tool drives the hand, not the other way round.** `placeTool()` is given the world
  position the working end must occupy and aims the tool along the character's own
  shoulder-to-work line; the grip point that falls out of that is what the arm IK is then
  solved onto. So the tool is always a straight extension of the arm and is reachable by
  construction.
- **The dark wall is dark because nothing is lighting it.** The lamp is a real spot light
  with a visible shaft; the beam is rescaled every frame to terminate exactly where it lands.
- **The charge crawl starts at the socket** the plug went into, not at the centre of the
  sign, because it is a mask growing outward from that point.
- **Feet are world-locked.** A foot picks a spot when it lands and stays there until it
  swings again, so the ground never slides under him however the pace changes.

## The geometry is derived, not eyeballed

The whole composition falls out of one measurement: how far the character can actually
reach. `layout()` measures the rig's shoulder-to-wrist off the loaded skeleton, adds the
brush length beyond his grip, subtracts what the depth to the wall costs, and puts the top
edge of the logo row exactly there. The row lands out of standing reach automatically —
which is *why* he is carrying a ladder — and every slot's far top corner is inside his
sweep.

The z stack (character plane, wall, slot, sign panel) is a fraction of his height rather
than a pixel constant, so the depth-to-reach ratio is identical on a phone and a 4K display.

## Files

| file | what is in it |
| --- | --- |
| `index.html` | page shell and controls |
| `logo-crew.css` | chrome only — the stage is one WebGL canvas |
| `js/crew-core.js` | scene, camera, lights, wall, layout, particles, procedural audio |
| `js/crew-surface.js` | per-slot canvases: brush/roller stamping, neon build, drips |
| `js/crew-props.js` | stepladder, kettle, brush, roller, lamp, cable, plug, hard hat |
| `js/crew-rig.js` | GLB load, analytic two-bone IK, gait, carry / climb / reach poses |
| `js/crew-show.js` | the schedule, both choreographies, main loop, boot |
| `vendor/` | three.js + GLTFLoader, repacked as classic scripts so `file://` works |
| `assets/puller.glb.js` | the rigged humanoid, base64'd into a classic script |

## Making it yours

- **Logos** — `CREW.DATA` in `crew-core.js`. Each entry is a name, a mark, a paint colour
  and a neon colour. `perPass` is 5 wide / 3 narrow; the list is sliced into passes.
- **Marks** — `drawMark()` (paint) and `drawMarkAsTube()` (neon) in `crew-surface.js`. Add a
  `case` to both. Real client logos would replace these with an image drawn into the art
  canvas; everything downstream works off the artwork's own ink bounds.
- **Character** — replace `assets/puller.glb.js`. Any standard humanoid rig works; the bone
  lookup strips a `mixamorig` prefix, and every proportion is measured rather than assumed.
- **Pace** — the slider, or `CFG.pace`. One pass is ~18s at 1.0×; the full ten-logo loop is
  ~40s. Without the ladder business a pass would be nearer 12s — the ladder is what buys the
  story, and it costs about six seconds a pass.
- **Tunables** — everything worth turning is in `CFG` at the top of `crew-core.js`.

## Verifying changes

`window.__crew` is exposed for review:

```js
__crew.info()        // duration, current act, layout numbers, reach budget, tri/draw counts
__crew.seek(12.4)    // replay from zero to that time — the wall is cumulative, so it rebuilds
__crew.step(4)       // advance N fixed frames and render
__crew.SHOW.playing = false
```

Judge it from **1:1 crops of the thing you changed, across several frames of the actual
motion** — at page zoom, a brush that is not touching the wall and a hand that is not
touching the brush both look fine.

## Notes and limits

- ~57k triangles / 59 draw calls in the light theme, ~92k / 95 in the dark one.
- The payload is 4.6 MB, almost all of it `vendor/three.bundle.js` and the base64'd rig. On a
  real site, serve the rig as a plain `.glb` over HTTP instead — the base64 is only there so
  the page works from `file://`, and dropping it saves ~600 KB plus the decode.
- His head clips the bottom edge of the slot he is working on by a few pixels at some sizes.
  That is the cost of putting the row as high as his reach allows; `S.headClears` reports it.
- Sound is synthesised (no audio files) and starts off — browsers need a gesture first.
- Reduced-motion is respected for the incidental motion but the loop still plays; if you need
  it fully still, gate `SHOW.playing` on `prefers-reduced-motion`.

## Licence and third-party assets

The code in this repository is MIT — see [LICENSE](LICENSE).

That does **not** cover the bundled third-party assets, which keep their own terms:

- `vendor/three.bundle.js`, `vendor/GLTFLoader.bundle.js` — [three.js](https://threejs.org),
  MIT, repacked here as classic scripts so the page runs over `file://`.
- `assets/puller.glb.js` — a rigged humanoid derived from a three.js example character
  (Mixamo lineage). **Check its licence before using this commercially.** Swapping it is one
  file; nothing in the rig code assumes that particular skeleton beyond standard humanoid
  bone names.
