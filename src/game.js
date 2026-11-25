export function startGame(THREE) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const isSmall = Math.min(innerWidth, innerHeight) < 700;
  const settings = loadSettings();
  const bindings = loadBindings();
  let bindingTarget = null;
  const keys = {};
  let renderer, scene, camera, clock, ambient, hemi, moon, fireLight, tableLamp, porchLight;
  let audioCtx = null, ambientAudio = null, audioStarted = false;
  let yaw = 0, pitch = 0, gameActive = false, paused = false, inMenu = true, radioOpen = false;
  let currentTarget = null, toastTimer = 0, stepTimer = 0, nightValue = 0.08, gameSeconds = 0;
  let mobileRun = false, touchMove = {x:0,z:0}, lookPointer = null, lookLast = {x:0,y:0}, shouldRelockAfterRadio = false;
  let lanternAvailable = false, lanternOn = false, lanternRig, lanternPoint, lanternSpot;
  let introActive = false, introElapsed = 0, settingsFromPause = false, introStartZ = 3.5;
  let snowPoints, snowPositions, snowVelocities, dustPoints;
  let deer, deerLegs = [], deerState = 'idle', deerClock = 0;
  let visitor, visitorVisible = false, visitorTimer = 0, visitorKnocks = 0;
  let doorPivot, doorOpen = false, porchOn = false, stoveLit = false;
  let radioFrequency = 89.7;
  const colliders = [];
  const interactions = [];
  const materials = {};
  const interactables = {};
  const state = {
    stage: 0, radioTuned: false, woodTaken: false, woodAdded: false,
    outsideSeen: false, deerSeen: false, cliffSeen: false, tapeFound: false,
    porchOn: false, visitorResolved: false, ended: false, lanternTaken: false,
    inspectCount: 0
  };
  const world = {
    scene: null, camera: null, trees: [], snowRoots: [], windows: [],
    cabinInterior: [], outsideObjects: [], timeLabels: ['18:42','19:06','19:31','19:58','20:14']
  };

  initRenderer();
  initWorld();
  initUI();
  initAudio();
  bindEvents();
  animate();
  showMenu();

  function loadSettings() {
    const defaults = { volume: 70, sensitivity: 75, quality: 'medium', grain: 28 };
    try { return {...defaults, ...JSON.parse(localStorage.getItem('wn_settings') || '{}')}; }
    catch { return defaults; }
  }
  function saveSettings() { try { localStorage.setItem('wn_settings', JSON.stringify(settings)); } catch {} }
  function loadBindings(){const defaults={forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',interact:'KeyE',lantern:'KeyF',run:'ShiftLeft'};try{return {...defaults,...JSON.parse(localStorage.getItem('wn_bindings')||'{}')};}catch{return defaults;}}
  function saveBindings(){try{localStorage.setItem('wn_bindings',JSON.stringify(bindings));}catch{}}
  function keyLabel(code){const names={ShiftLeft:'SHIFT',ShiftRight:'SHIFT',Space:'SPACE',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Backspace:'BACKSPACE'};if(names[code])return names[code];if(code.startsWith('Key'))return code.slice(3);if(code.startsWith('Digit'))return code.slice(5);return code.replace('Numpad','NUM ').toUpperCase();}
  function refreshBindings(){for(const [action,code] of Object.entries(bindings)){const el=$(`bind-${action}`);if(el)el.textContent=keyLabel(code);}document.querySelectorAll('[data-bind]').forEach(b=>b.classList.toggle('waiting',b.dataset.bind===bindingTarget));$('rebind-message').textContent=bindingTarget?`PRESS A KEY FOR ${bindingTarget.toUpperCase()} · ESC TO CANCEL`:'SELECT A KEY TO REASSIGN IT. PRESS ESC TO CANCEL.';}
  function loadSave() { try { return JSON.parse(localStorage.getItem('wn_save') || 'null'); } catch { return null; } }
  function persist() {
    try { localStorage.setItem('wn_save', JSON.stringify({state, x:camera.position.x, z:camera.position.z, yaw, pitch, nightValue, doorOpen, stoveLit, porchOn, radioFrequency})); } catch {}
    const saved = loadSave();
    $('btn-continue').disabled = !saved || !!saved.state?.ended;
  }
  function applySave(data) {
    if (!data) return;
    Object.assign(state, data.state || {});
    camera.position.set(data.x ?? 0, 1.65, data.z ?? 2.3);
    yaw = data.yaw ?? 0; pitch = data.pitch ?? 0; nightValue = data.nightValue ?? 0.08;radioFrequency=data.radioFrequency??89.7;$('radio-range').value=Math.round(radioFrequency*10);$('radio-frequency-value').textContent=radioFrequency.toFixed(1);
    doorOpen = !!data.doorOpen; stoveLit = data.stoveLit !== false; porchOn = !!data.porchOn;
    if (doorPivot) doorPivot.rotation.y = doorOpen ? -1.15 : 0;
    if (porchLight) porchLight.intensity = porchOn ? 2.3 : 0;
    if (world.porchBulb) world.porchBulb.material = porchOn ? materials.warmGlass : materials.metal;
    lanternAvailable=!!state.lanternTaken;lanternOn=false;if(world.lanternProp)world.lanternProp.visible=!state.lanternTaken;if(lanternRig)lanternRig.visible=false;if(lanternPoint)lanternPoint.intensity=0;if(lanternSpot)lanternSpot.intensity=0;
    if(fireLight)fireLight.intensity=stoveLit?7:.8;
    if(state.deerSeen){deerState='gone';deer.visible=false;}else{deerState='idle';deer.visible=true;}
    visitorVisible=false;visitor.visible=false;visitorTimer=0;
    updateObjective();
  }

  function initRenderer() {
    const quality = settings.quality;
    renderer = new THREE.WebGLRenderer({canvas, antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? (quality === 'high' ? 1.25 : 1) : 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = quality !== 'low' && !isTouch;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9aa8b0);
    scene.fog = new THREE.FogExp2(0x9aa8b0, 0.012);
    camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.08, 260);
    camera.position.set(0,1.65,3.5);
    camera.rotation.order = 'YXZ';
    clock = new THREE.Clock();
    world.scene = scene; world.camera = camera;
  }

  function canvasTexture(draw, repeatX=1, repeatY=1, colorSpace=true) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d'); draw(ctx, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    if (colorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  function makeWoodTexture(kind='wall') {
    return canvasTexture((ctx,w,h)=>{
      ctx.fillStyle = kind==='floor' ? '#655044' : '#654f40'; ctx.fillRect(0,0,w,h);
      const rows = kind==='floor' ? 9 : 13;
      const rowH = h/rows;
      for(let r=0;r<rows;r++){
        const shade = 0.78 + Math.random()*0.35;
        const base = kind==='floor' ? [104,78,60] : [104,79,59];
        ctx.fillStyle = `rgb(${base.map(v=>Math.max(0,Math.min(255,v*shade|0))).join(',')})`;
        ctx.fillRect(0,r*rowH,w,rowH-2);
        for(let i=0;i<90;i++){
          const x=Math.random()*w, y=r*rowH+Math.random()*rowH;
          ctx.strokeStyle=Math.random()>.5?'rgba(31,21,17,.22)':'rgba(208,168,125,.10)';
          ctx.lineWidth=Math.random()*1.5+.2; ctx.beginPath();
          ctx.moveTo(x,y); ctx.bezierCurveTo(x+25,y-2,x+55,y+3,x+105+Math.random()*100,y+(Math.random()-.5)*2); ctx.stroke();
        }
        if(Math.random()>.55){
          const x=Math.random()*w,y=r*rowH+rowH*.5;
          ctx.strokeStyle='rgba(37,22,15,.26)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y,13,3,0,0,Math.PI*2);ctx.stroke();
          ctx.strokeStyle='rgba(211,173,133,.10)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,8,1.4,0,0,Math.PI*2);ctx.stroke();
        }
      }
      for(let i=0;i<17000;i++){
        const v=Math.random()*55;ctx.fillStyle=`rgba(${v|0},${v|0},${v|0},${Math.random()*.07})`;ctx.fillRect(Math.random()*w,Math.random()*h,1,1);
      }
    }, kind==='floor'?1.2:1.5, kind==='floor'?1.8:2.6);
  }
  function makeSnowTexture() {
    return canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#d5d9d8';ctx.fillRect(0,0,w,h);
      for(let i=0;i<24000;i++){
        const a=Math.random()*.18;const v=Math.random()>.5?255:75;
        ctx.fillStyle=`rgba(${v},${v},${v},${a})`;ctx.fillRect(Math.random()*w,Math.random()*h,Math.random()*2+.3,Math.random()*2+.3);
      }
      for(let i=0;i<120;i++){
        const x=Math.random()*w,y=Math.random()*h;ctx.strokeStyle='rgba(115,128,134,.08)';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.random()*45,y+Math.random()*5);ctx.stroke();
      }
    },2,3);
  }
  function makeFurTexture() {
    return canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#6a5041';ctx.fillRect(0,0,w,h);
      for(let i=0;i<28000;i++){const x=Math.random()*w,y=Math.random()*h;const light=Math.random()>.48;ctx.strokeStyle=light?'rgba(183,145,112,.13)':'rgba(28,20,17,.2)';ctx.lineWidth=Math.random()*1.2+.25;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(Math.random()-.5)*4,y+Math.random()*11+2);ctx.stroke();}
      for(let i=0;i<170;i++){const x=Math.random()*w,y=Math.random()*h;ctx.fillStyle='rgba(26,20,18,.12)';ctx.beginPath();ctx.ellipse(x,y,Math.random()*9+2,Math.random()*3+1,Math.random(),0,Math.PI*2);ctx.fill();}
    },2,2);
  }
  function makeFabricTexture() {
    return canvasTexture((ctx,w,h)=>{
      ctx.fillStyle='#6f625b';ctx.fillRect(0,0,w,h);
      for(let i=0;i<50000;i++) {ctx.fillStyle=Math.random()>.5?'rgba(220,205,184,.06)':'rgba(15,18,19,.09)';ctx.fillRect(Math.random()*w,Math.random()*h,1,1);}
      for(let y=0;y<h;y+=4){ctx.strokeStyle='rgba(18,20,21,.13)';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    },2,2);
  }
  function initMaterials() {
    materials.wallWood = new THREE.MeshStandardMaterial({map:makeWoodTexture('wall'),roughness:.91});
    materials.floorWood = new THREE.MeshStandardMaterial({map:makeWoodTexture('floor'),roughness:.86});
    materials.trim = new THREE.MeshStandardMaterial({color:0x403229,roughness:.72});
    materials.snow = new THREE.MeshStandardMaterial({map:makeSnowTexture(),color:0xdbe0df,roughness:.97});
    materials.rock = new THREE.MeshStandardMaterial({color:0x343b40,roughness:1});
    materials.fabric = new THREE.MeshStandardMaterial({map:makeFabricTexture(),roughness:1});
    materials.darkFabric = new THREE.MeshStandardMaterial({color:0x282f33,roughness:1});
    materials.metal = new THREE.MeshStandardMaterial({color:0x242a2d,metalness:.68,roughness:.42});
    materials.brass = new THREE.MeshStandardMaterial({color:0x92744e,metalness:.62,roughness:.35});
    materials.glass = new THREE.MeshStandardMaterial({color:0x8a9a9e,metalness:.12,roughness:.16,transparent:true,opacity:.28});
    materials.warmGlass = new THREE.MeshStandardMaterial({color:0xffc27d,emissive:0xff9b42,emissiveIntensity:1.1,roughness:.25});
    materials.windowGlow = new THREE.MeshStandardMaterial({color:0xffc27d,emissive:0xff8a3d,emissiveIntensity:.25,transparent:true,opacity:.34,roughness:.28});
    materials.mug = new THREE.MeshStandardMaterial({color:0xb9b1a2,roughness:.36});
    materials.deerFur = new THREE.MeshStandardMaterial({map:makeFurTexture(),color:0x8b7461,roughness:1});
    materials.deerDark = new THREE.MeshStandardMaterial({color:0x302923,roughness:1});
    materials.antler = new THREE.MeshStandardMaterial({color:0x8d806b,roughness:.9});
    materials.shadow = new THREE.MeshStandardMaterial({color:0x090d11,roughness:1});
  }
  function box(parent, w,h,d, mat, x,y,z, opts={}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
    mesh.position.set(x,y,z); mesh.castShadow=opts.cast!==false; mesh.receiveShadow=opts.receive!==false;
    if(opts.rot) mesh.rotation.set(...opts.rot);
    parent.add(mesh); return mesh;
  }
  function cylinder(parent, r1,r2,h,mat,x,y,z,segments=12,rot=null) {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat);m.position.set(x,y,z);if(rot)m.rotation.set(...rot);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function sphere(parent, rx,ry,rz,mat,x,y,z,segments=12) {
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,segments,Math.max(8,segments>>1)),mat);m.scale.set(rx,ry,rz);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function addCollider(x,z,hx,hz,tag='prop') { colliders.push({x,z,hx,hz,tag}); }
  function register(id, object, label, hint, callback, maxDist=2.4) {
    interactions.push({id,object,label,hint,callback,maxDist,used:false}); interactables[id]=object;
  }

  function initWorld() {
    initMaterials();
    const skyGeo=new THREE.SphereGeometry(220,24,16);
    const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x758897)},mid:{value:new THREE.Color(0xb8c0c0)},low:{value:new THREE.Color(0x4c5960)},night:{value:0.0}},vertexShader:`varying vec3 vPos; void main(){vPos=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform vec3 top;uniform vec3 mid;uniform vec3 low;uniform float night;varying vec3 vPos;void main(){float h=clamp(vPos.y*.5+.5,0.0,1.0);vec3 c=mix(low,mid,smoothstep(0.0,.62,h));c=mix(c,top,smoothstep(.42,1.0,h));vec3 n=mix(vec3(.035,.05,.075),vec3(.12,.16,.22),smoothstep(0.0,1.0,h));c=mix(c,n,night);gl_FragColor=vec4(c,1.0);}`});
    const sky=new THREE.Mesh(skyGeo,skyMat);sky.frustumCulled=false;scene.add(sky);world.sky=sky;world.skyMat=skyMat;
    hemi=new THREE.HemisphereLight(0xdde6ec,0x3e4448,.72);scene.add(hemi);
    moon=new THREE.DirectionalLight(0xb9c9d6,1.5);moon.position.set(-18,28,12);moon.castShadow=renderer.shadowMap.enabled;moon.shadow.mapSize.set(1024,1024);moon.shadow.camera.left=-35;moon.shadow.camera.right=35;moon.shadow.camera.top=35;moon.shadow.camera.bottom=-45;moon.shadow.bias=-.00035;moon.shadow.normalBias=.02;scene.add(moon);
    ambient=new THREE.AmbientLight(0x8c9ba3,.24);scene.add(ambient);
    buildCabin(); buildFurniture(); buildExterior(); buildDeer(); buildVisitor(); buildParticles(); buildLantern();
  }

  function buildCabin() {
    const floor=box(scene,12,.3,10,materials.floorWood,0,-.15,0);world.cabinInterior.push(floor);
    box(scene,12,.16,10,new THREE.MeshStandardMaterial({color:0x362d28,roughness:.98}),0,3.2,0,{cast:false});
    for(let z=-4.2;z<=4.2;z+=2.1) box(scene,12,.13,.16,materials.trim,0,3.08,z,{cast:false});
    // Exterior and interior walls; the north wall leaves a real doorway.
    box(scene,12,3.5,.42,materials.wallWood,0,1.65,5.0); addCollider(0,5.0,6,.25,'wall');
    buildSideWall(-6,[-1.8,2.3]); addCollider(-6,0,.25,5,'wall');
    buildSideWall(6,[-1.8]); addCollider(6,0,.25,5,'wall');
    box(scene,5.2,3.5,.42,materials.wallWood,-3.4,1.65,-5); addCollider(-3.4,-5,2.6,.25,'wall');
    box(scene,5.2,3.5,.42,materials.wallWood,3.4,1.65,-5); addCollider(3.4,-5,2.6,.25,'wall');
    box(scene,.16,3.15,.18,materials.trim,-.84,1.55,-5.18);box(scene,.16,3.15,.18,materials.trim,.84,1.55,-5.18);
    box(scene,1.82,.18,.18,materials.trim,0,3.12,-5.18);
    // Gable roof and dark inner beams.
    const roofMat=new THREE.MeshStandardMaterial({color:0x302b29,roughness:.95});
    const roofA=box(scene,12.8,.25,5.9,roofMat,0,4.0,-2.55,{rot:[-.32,0,0]});
    const roofB=box(scene,12.8,.25,5.9,roofMat,0,4.0,2.55,{rot:[.32,0,0]});
    for(let x=-5.2;x<=5.2;x+=2.6){box(scene,.18,.26,10.2,materials.trim,x,3.22,0,{cast:false});}
    // door pivot, panel and aged iron handle.
    doorPivot=new THREE.Group();doorPivot.position.set(-.78,0,-5.12);scene.add(doorPivot);
    box(doorPivot,1.52,2.8,.15,materials.trim,.76,1.42,0);
    box(doorPivot,1.28,2.52,.07,materials.wallWood,.76,1.42,-.09);
    box(doorPivot,.16,.16,.06,materials.brass,1.31,1.34,-.18);
    box(doorPivot,.04,.55,.06,materials.trim,1.31,.98,-.18);
    // Windows with deep frames.
    buildWindow(-5.78,1.95,-1.8,'x'); buildWindow(5.78,1.95,-1.8,'x');
    buildWindow(-5.78,1.95,2.3,'x');
    // Hearth / floorboard edge trim.
    box(scene,12,.16,.22,materials.trim,0,.04,-4.72);box(scene,12,.16,.22,materials.trim,0,.04,4.72);
    box(scene,.2,.16,10,materials.trim,-5.72,.04,0);box(scene,.2,.16,10,materials.trim,5.72,.04,0);
    // Foundation / outside porch.
    box(scene,13,.6,11,materials.rock,0,-.46,0,{cast:false});
    box(scene,3.8,.22,1.8,materials.trim,0,-.03,-6.05);box(scene,3.2,.12,.35,materials.wallWood,0,.12,-6.82);
    // Outside siding accent logs and porch posts.
    for(let i=0;i<8;i++){
      const y=.35+i*.42;
      for(const x of [-3.4,3.4]) cylinder(scene,.14,.14,5.2,materials.trim,x,y,-5.18,8,[0,0,Math.PI/2]);
    }
    for(const x of [-1.9,1.9]){box(scene,.18,2.7,.18,materials.trim,x,1.35,-6.75);}
    // Colliders around inner furniture are added in buildFurniture.
  }
  function buildSideWall(x, windowPositions) {
    const sorted=[...windowPositions].sort((a,b)=>a-b);let cursor=-5;
    for(const z of sorted){
      const left=z-1.0,right=z+1.0;
      if(left>cursor){const len=left-cursor;box(scene,.42,3.5,len,materials.wallWood,x,1.65,(cursor+left)/2);}
      box(scene,.42,1.05,2.0,materials.wallWood,x,.525,z);
      box(scene,.42,.7,2.0,materials.wallWood,x,3.15,z);
      cursor=right;
    }
    if(cursor<5){const len=5-cursor;box(scene,.42,3.5,len,materials.wallWood,x,1.65,(cursor+5)/2);}
  }
  function buildWindow(x,y,z,axis) {
    const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);
    const inward=x<0?1:-1;
    // A real opening in the wall: thin glass, dark timber jambs and an old brass latch.
    for(const dz of [-.97,.97]) box(group,.2,1.94,.13,materials.trim,0,0,dz);
    for(const dy of [-.91,.91]) box(group,.2,.13,2.05,materials.trim,0,dy,0);
    box(group,.035,1.68,1.78,materials.glass,inward*.06,0,0,{cast:false});
    box(group,.035,1.6,.055,materials.trim,inward*.08,0,0,{cast:false});
    box(group,.035,.05,1.78,materials.brass,inward*.08,0,0,{cast:false});
    const warm=box(group,.02,1.58,1.72,materials.windowGlow,inward*.085,0,0,{cast:false});
    world.windows.push({glass:warm,x,z});
  }

  function buildFurniture() {
    // Cast-iron stove with a softly moving fire slit.
    const stove=new THREE.Group();stove.position.set(-4.25,0,-2.35);scene.add(stove);
    box(stove,1.25,1.38,1.1,materials.metal,0,.77,0);
    box(stove,.83,.53,.08,materials.trim,0,.75,-.58);
    const firePane=box(stove,.68,.38,.03,materials.warmGlass,0,.76,-.635,{cast:false});
    cylinder(stove,.14,.14,2.8,materials.metal,0,2.55,.08,12);
    cylinder(stove,.22,.22,.12,materials.trim,0,3.96,.08,12);
    box(stove,1.5,.12,1.3,materials.trim,0,.1,0);
    fireLight=new THREE.PointLight(0xff9c4e,stoveLit?7.0:1.0,9,2);fireLight.position.set(-4.25,1.05,-2.6);scene.add(fireLight);
    const logPile=new THREE.Group();logPile.position.set(-2.8,0,1.5);scene.add(logPile);
    for(let i=0;i<7;i++){
      const len=.78+Math.random()*.18;const l=cylinder(logPile,.12,.13,len,new THREE.MeshStandardMaterial({color:[0x5a3f2e,0x684b37,0x78563d][i%3],roughness:.95}),-.35+(i%3)*.36,.24+Math.floor(i/3)*.22,0,8,[0,0,Math.PI/2]);
      l.rotation.z=Math.PI/2+(Math.random()-.5)*.12;
    }
    register('wood',logPile,'SPLIT FIREWOOD','TAKE A COUPLE OF LOGS',()=>{
      if(!state.woodTaken&&!state.woodAdded){state.woodTaken=true;notify('You take two dry logs. The bark is cold and loose.');updateObjective();persist();}
      else if(state.woodTaken)notify('The stove is beside you. Put the logs down there.');
      else notify('There are enough logs by the stove for now.');
    },2.8);
    const stoveTarget=new THREE.Object3D();stoveTarget.position.set(-4.1,1.1,-2.35);scene.add(stoveTarget);
    register('stove',stoveTarget,'IRON STOVE','ADD THE FIREWOOD',()=>{
      if(state.woodTaken&&!state.woodAdded){state.woodAdded=true;state.woodTaken=false;stoveLit=true;fireLight.intensity=8;notify('The stove catches. The room feels a little smaller, a little safer.');updateObjective();persist();}
      else notify(state.woodAdded?'The stove is warm.':'You need a couple of dry logs first.');
    },2.6);
    addCollider(-4.25,-2.35,.8,.7,'stove');
    // Hearth side chair.
    const chair=new THREE.Group();chair.position.set(-2.0,0,-1.7);scene.add(chair);
    box(chair,1.15,.22,1.0,materials.fabric,0,.55,0);
    box(chair,1.15,1.1,.2,materials.darkFabric,0,1.12,.42);
    for(const x of [-.45,.45]) for(const z of [-.37,.37]) box(chair,.11,.58,.11,materials.trim,x,.3,z);
    addCollider(-2,-1.7,.7,.65,'chair');
    // Dining table, old mug and note.
    const table=new THREE.Group();table.position.set(.9,0,-.25);scene.add(table);
    box(table,2.2,.14,1.25,materials.wallWood,0,.95,0);
    for(const x of [-.9,.9]) for(const z of [-.45,.45]) box(table,.12,.92,.12,materials.trim,x,.46,z);
    const mug=new THREE.Group();mug.position.set(.25,1.03,-.12);table.add(mug);
    cylinder(mug,.16,.14,.28,materials.mug,0,.14,0,20);
    const handle=new THREE.Mesh(new THREE.TorusGeometry(.1,.025,8,16),materials.mug);handle.position.set(.15,.14,0);mug.add(handle);
    register('mug',mug,'OLD COFFEE','INSPECT THE MUG',()=>notify('The coffee has formed a thin skin. It smells faintly of burnt sugar.'),2.6);
    const note=box(table,.48,.014,.32,new THREE.MeshStandardMaterial({color:0xb7a98d,roughness:1}),-.45,1.04,.15,{rot:[0,.18,0],cast:false});
    register('note',note,'FOLDED NOTE','READ THE NOTE',()=>{notify('“If the sea goes quiet, do not answer the second call.”');state.inspectCount++;persist();},2.5);
    addCollider(.9,-.25,1.2,.75,'table');
    // Sofa, worn cloth and pillow seams.
    const sofa=new THREE.Group();sofa.position.set(3.8,0,1.0);scene.add(sofa);
    box(sofa,2.5,.45,1.1,materials.fabric,0,.48,0);
    box(sofa,2.5,1.05,.25,materials.darkFabric,0,1.02,.42);
    for(const x of [-1.18,1.18]) box(sofa,.22,.75,1.0,materials.fabric,x,.68,0);
    box(sofa,.75,.28,.68,materials.darkFabric,-.45,.88,-.03);
    addCollider(3.8,1,.95,.75,'sofa');
    // Kitchen cabinet, enamel sink and dishes.
    const kitchen=new THREE.Group();kitchen.position.set(4.75,0,-3.0);scene.add(kitchen);
    box(kitchen,1.55,1.0,.82,materials.trim,0,.55,0);
    box(kitchen,1.66,.12,.9,materials.metal,0,1.12,0);
    box(kitchen,.9,.06,.52,materials.mug,0,1.2,-.05);
    cylinder(kitchen,.05,.05,.24,materials.brass,.45,1.32,.16,12);
    box(kitchen,.06,.06,.06,materials.brass,.45,1.45,.16);
    addCollider(4.75,-3,.95,.55,'kitchen');
    // Radio, speaker grille and amber dial.
    const radio=new THREE.Group();radio.position.set(.15,1.06,-.15);table.add(radio);
    box(radio,.85,.48,.36,materials.trim,0,.25,0);
    box(radio,.72,.34,.04,materials.darkFabric,0,.25,-.205);
    for(let i=0;i<7;i++) box(radio,.025,.25,.025,materials.brass,-.27+i*.09,.25,-.235,{cast:false});
    box(radio,.19,.08,.035,materials.warmGlass,.18,.41,-.22,{cast:false});
    cylinder(radio,.07,.07,.07,materials.brass,.28,.13,-.23,16,[Math.PI/2,0,0]);
    const radioTarget=new THREE.Object3D();radioTarget.position.set(1.15,1.4,-.25);scene.add(radioTarget);
    register('radio',radioTarget,'SHORTWAVE RADIO','TUNE / LISTEN',()=>{if(state.visitorResolved){showEnding();}else openRadio();},2.8);
    addCollider(3.1,-.25,.1,.1,'radio');
    // Wall photographs and a map of the coast.
    const photo1=buildFrame(-2.8,2.25,4.76,0x4c5352);const photo2=buildFrame(2.0,2.2,4.76,0x59544a);
    register('photo',photo1,'FAMILY PHOTOGRAPH','LOOK AT THE PHOTOGRAPH',()=>notify('The faces have faded, but the date on the back is still clear: 1979.'),2.8);
    const map=buildFrame(4.6,2.05,4.76,0x786e5b,.95,.65);
    register('map',map,'COASTAL SURVEY MAP','INSPECT THE MAP',()=>notify('The old lookout is marked in red. Someone has drawn a circle around the cliff.'),2.8);
    // Coat hook and lantern pickup.
    const coat=new THREE.Group();coat.position.set(-2.2,0,-4.25);scene.add(coat);
    cylinder(coat,.04,.04,.8,materials.brass,0,2.2,0,8);
    sphere(coat,.42,.72,.24,materials.darkFabric,0,1.55,.12,12);
    box(coat,.55,.08,.12,materials.trim,0,2.28,0);
    const lantern=new THREE.Group();lantern.position.set(-.8,1.08,1.05);scene.add(lantern);
    cylinder(lantern,.18,.15,.34,materials.brass,0,.18,0,12);
    cylinder(lantern,.11,.11,.3,materials.warmGlass,0,.19,0,12);
    const cap=cylinder(lantern,.2,.17,.08,materials.metal,0,.4,0,12);
    const hoop=new THREE.Mesh(new THREE.TorusGeometry(.14,.025,8,16,Math.PI),materials.brass);hoop.position.set(0,.48,0);lantern.add(hoop);
    world.lanternProp=lantern;
    register('lantern',lantern,'FIELD LANTERN','TAKE THE LANTERN',()=>{
      if(!lanternAvailable){lanternAvailable=true;state.lanternTaken=true;lantern.visible=false;notify('You take the old field lantern. The switch clicks twice before it catches.');updateObjective();persist();}
      else toggleLantern();
    },2.5);
    // Basement hatch; no dangerous activity, just an old storage crawlspace.
    const hatch=new THREE.Group();hatch.position.set(-4.2,.03,2.8);scene.add(hatch);
    box(hatch,1.35,.12,1.8,materials.trim,0,0,0);
    box(hatch,1.17,.05,1.61,materials.wallWood,0,.08,0);
    box(hatch,.1,.13,.1,materials.brass,.48,.13,.63);
    world.hatch=hatch;
    register('hatch',hatch,'BASEMENT HATCH','OPEN THE HATCH',()=>{
      if(!state.tapeFound){state.tapeFound=true;state.radioTuned=false;radioFrequency=89.7;$('radio-range').value=897;$('radio-frequency-value').textContent='89.7';notify('Under the stairs: a cassette wrapped in a damp wool scarf. The label says “WHITE NOISE”. The receiver falls back to static.');updateObjective();persist();}
      else notify('Cold air rises from the crawlspace. There is nothing else down there.');
      hatch.rotation.x=-.22;
    },2.6);
    // Exterior wall rack with unused, purely decorative ranger equipment.
    const rack=new THREE.Group();rack.position.set(5.66,1.7,1.5);rack.rotation.y=-Math.PI/2;scene.add(rack);
    box(rack,1.5,.12,.12,materials.trim,0,0,0);
    box(rack,.08,.8,.08,materials.trim,-.58,-.38,0);box(rack,.08,.8,.08,materials.trim,.58,-.38,0);
    box(rack,.12,1.3,.1,materials.darkFabric,-.35,-.02,.16); // old canvas case
    box(rack,.15,.48,.12,materials.trim,.18,-.42,.16);
    box(rack,.13,.7,.13,materials.brass,.55,-.3,.16);
    addCollider(5.7,1.5,.28,.5,'rack');
    // Wall switch by the entry.
    const switchObj=new THREE.Group();switchObj.position.set(1.15,1.5,-4.72);scene.add(switchObj);
    box(switchObj,.16,.25,.06,materials.trim,0,0,0);
    box(switchObj,.035,.1,.03,materials.brass,0,0,-.05);
    register('porchSwitch',switchObj,'PORCH LIGHT SWITCH','TURN ON THE PORCH LIGHT',()=>togglePorch(),2.4);
    // Warm practical lights.
    tableLamp=new THREE.PointLight(0xffbd76,4.4,8,2);tableLamp.position.set(2.5,2.25,1.1);scene.add(tableLamp);
    const lampShade=new THREE.Group();lampShade.position.set(2.5,2.45,1.1);scene.add(lampShade);
    cylinder(lampShade,.28,.2,.42,materials.fabric,0,0,0,16);
    cylinder(lampShade,.07,.07,.16,materials.brass,0,-.28,0,12);
    porchLight=new THREE.PointLight(0xffc486,0,11,2);porchLight.position.set(0,3,-7.4);scene.add(porchLight);
    const porchBulb=sphere(scene,.09,.09,.09,materials.metal,0,3.45,-6.9,12);world.porchBulb=porchBulb;
    register('door',doorPivot,'FRONT DOOR','OPEN / CLOSE THE FRONT DOOR',()=>{
      doorOpen=!doorOpen;doorPivot.rotation.y=doorOpen?-1.15:0;playSfx('door');
      notify(doorOpen?'Cold air slips into the cabin.':'The door settles into its frame.');
      if(doorOpen&&!state.outsideSeen){state.stage=Math.max(state.stage,1);updateObjective();}
      persist();
    },2.8);
  }

  function buildFrame(x,y,z,color,w=.7,h=.95) {
    const group=new THREE.Group();group.position.set(x,y,z);scene.add(group);
    box(group,w,h,.1,materials.trim,0,0,0);
    box(group,w-.12,h-.12,.035,new THREE.MeshStandardMaterial({color,roughness:1}),0,0,-.065);
    box(group,w-.2,.018,.02,materials.brass,0,-h*.27,-.09,{cast:false});
    return group;
  }

  function buildExterior() {
    // Snow apron around the cabin and a short trail to the sea cliff.
    const ground=box(scene,80,.25,72,materials.snow,0,-.35,-20,{cast:false});
    // Path, subtly darker compressed snow.
    const pathMat=new THREE.MeshStandardMaterial({color:0xb9c3c7,roughness:1});
    const path=new THREE.Mesh(new THREE.PlaneGeometry(4.4,27),pathMat);path.rotation.x=-Math.PI/2;path.position.set(0,-.19,-19.5);scene.add(path);
    for(let i=0;i<34;i++){
      const z=-7.8-i*.66;const x=Math.sin(i*.72)*.26;
      const foot= new THREE.Mesh(new THREE.CircleGeometry(.13,7),new THREE.MeshStandardMaterial({color:0x89979e,transparent:true,opacity:.22,roughness:1}));
      foot.rotation.x=-Math.PI/2;foot.position.set(x+(i%2?.2:-.2),-.175,z);scene.add(foot);
    }
    // Pine forest framing the trail. Shared geometry keeps the small world lightweight.
    const trunkGeo=new THREE.CylinderGeometry(.12,.2,4.5,7);
    const branchGeos=[new THREE.ConeGeometry(1.25,2.2,8),new THREE.ConeGeometry(.98,1.95,8),new THREE.ConeGeometry(.7,1.6,8)];
    const pineMat=new THREE.MeshStandardMaterial({color:0x243c3e,roughness:1});
    const snowMat=new THREE.MeshStandardMaterial({color:0xd4dcdb,roughness:1});
    const positions=[];
    for(let side of [-1,1]) for(let i=0;i<12;i++) positions.push({x:side*(8.5+Math.random()*9),z:-7.5-i*2.1+Math.random()*1.8,s:1.15+Math.random()*.75});
    positions.push({x:-3.5,z:-27.8,s:1.65},{x:4.4,z:-27.4,s:1.9},{x:-18,z:-7,s:1.8},{x:18,z:-8,s:1.6});
    const dummy=new THREE.Object3D();
    const trunkMat=new THREE.MeshStandardMaterial({map:makeWoodTexture('wall'),color:0x756054,roughness:1});
    const trunkBatch=new THREE.InstancedMesh(trunkGeo,trunkMat,positions.length);
    trunkBatch.castShadow=true;trunkBatch.receiveShadow=true;
    const branchBatches=branchGeos.map((geo)=>{const m=new THREE.InstancedMesh(geo,pineMat,positions.length);m.castShadow=true;m.receiveShadow=true;return m;});
    const snowGeos=[1.28,1.0,.72].map(r=>new THREE.ConeGeometry(r,.28,8));
    const snowBatches=snowGeos.map(geo=>new THREE.InstancedMesh(geo,snowMat,positions.length));
    positions.forEach((p,i)=>{
      dummy.position.set(p.x,2.25*p.s,p.z);dummy.scale.setScalar(p.s);dummy.rotation.set(0,Math.random()*.6,0);dummy.updateMatrix();trunkBatch.setMatrixAt(i,dummy.matrix);
      for(let j=0;j<3;j++){
        const y=(2.15+j*.82)*p.s;dummy.position.set(p.x,y,p.z);dummy.scale.setScalar(p.s);dummy.rotation.set(0,Math.random()*.6,0);dummy.updateMatrix();branchBatches[j].setMatrixAt(i,dummy.matrix);
        dummy.position.set(p.x,y+.55*p.s,p.z);dummy.scale.set(p.s,p.s,p.s);dummy.updateMatrix();snowBatches[j].setMatrixAt(i,dummy.matrix);
      }
      addCollider(p.x,p.z,.42*p.s,.42*p.s,'tree');
    });
    trunkBatch.instanceMatrix.needsUpdate=true;scene.add(trunkBatch);branchBatches.forEach(m=>{m.instanceMatrix.needsUpdate=true;scene.add(m);});snowBatches.forEach(m=>{m.instanceMatrix.needsUpdate=true;scene.add(m);});
    world.treeBatches=[trunkBatch,...branchBatches,...snowBatches];
    // Stumps, rocks and cut-log stack near the cabin.
    for(const [x,z,s] of [[-7.2,-8,.8],[7.2,-12,.7],[-5,-25,1],[6.5,-25,.8]]){
      cylinder(scene,.38*s,.44*s,.34*s,materials.rock,x,.02,z,8);addCollider(x,z,.35*s,.35*s,'rock');
      sphere(scene,.23*s,.08*s,.25*s,materials.snow,x,.22*s,z,8);
    }
    const outsideLogs=new THREE.Group();outsideLogs.position.set(-7.4,0,-6.8);scene.add(outsideLogs);
    for(let i=0;i<5;i++) cylinder(outsideLogs,.13,.14,1.45,new THREE.MeshStandardMaterial({color:0x634831,roughness:1}),.1+(i%2)*.2,.14+Math.floor(i/2)*.22,0,8,[0,0,Math.PI/2]);
    register('outsideLogs',outsideLogs,'WOODPILE','STACK THE SPLIT LOGS',()=>notify('The logs are already split and stacked. You leave the hatchet where it is.'),2.4);
    // Coastline and cliff: fractured edge with a rock face dropping toward the sea.
    const cliffShape=new THREE.Shape();cliffShape.moveTo(-32,0);
    for(let i=0;i<=20;i++){const x=-32+i*3.2;cliffShape.lineTo(x,Math.sin(i*2.1)*.5+Math.random()*.22);}
    cliffShape.lineTo(32,-13);cliffShape.lineTo(-32,-13);cliffShape.closePath();
    const cliffGeo=new THREE.ShapeGeometry(cliffShape,2);
    const cliff=new THREE.Mesh(cliffGeo,materials.rock);cliff.position.set(0,0,-32.7);cliff.rotation.y=0;scene.add(cliff);
    // Jagged rock shelves at the foot of the cliff.
    for(let i=0;i<24;i++){
      const x=-25+Math.random()*50,z=-34-Math.random()*3,y=-3-Math.random()*7;
      const r=new THREE.Mesh(new THREE.DodecahedronGeometry(.9+Math.random()*1.6,0),materials.rock);r.position.set(x,y,z);r.scale.y=.55;r.rotation.set(Math.random(),Math.random(),Math.random());scene.add(r);
    }
    const waterMat=new THREE.ShaderMaterial({uniforms:{time:{value:0},night:{value:0},deep:{value:new THREE.Color(0x152c3a)},surface:{value:new THREE.Color(0x526874)}},vertexShader:`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.0);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`uniform float time;uniform float night;uniform vec3 deep;uniform vec3 surface;varying vec2 vUv;varying vec3 vWorld;void main(){float wave=sin(vWorld.x*.19+time*.48)*.03+sin(vWorld.z*.31-time*.38)*.024+sin((vWorld.x+vWorld.z)*.13+time*.25)*.02;float glint=pow(max(0.0,sin(vWorld.x*.8+vWorld.z*.6+time*1.2)),28.0)*.12;vec3 c=mix(surface,deep,clamp(.55+wave,0.0,1.0));c+=glint;c=mix(c,vec3(.012,.022,.034),night*.62);gl_FragColor=vec4(c,.97);}` ,transparent:true});
    const sea=new THREE.Mesh(new THREE.PlaneGeometry(120,100,1,1),waterMat);sea.rotation.x=-Math.PI/2;sea.position.set(0,-11,-80);scene.add(sea);world.waterMat=waterMat;
    // Thin wind-torn mist layers above sea.
    for(let i=0;i<4;i++){
      const mist=new THREE.Mesh(new THREE.PlaneGeometry(60,4),new THREE.MeshBasicMaterial({color:0xaebbc0,transparent:true,opacity:.055,depthWrite:false}));mist.position.set((i%2?8:-7),-4.5+i*.8,-45-i*3);scene.add(mist);world.snowRoots.push(mist);
    }
    // Small path lamps; they are not overly bright.
    for(const [x,z] of [[-3.3,-12],[3.3,-18],[-3.1,-24]]){
      cylinder(scene,.04,.06,1.6,materials.metal,x,.65,z,8);
      sphere(scene,.09,.14,.09,materials.warmGlass,x,1.5,z,8);
      const p=new THREE.PointLight(0xdba875,.35,4,2);p.position.set(x,1.5,z);scene.add(p);
    }
    const lookoutTarget=new THREE.Object3D();lookoutTarget.position.set(0,1.1,-28.6);scene.add(lookoutTarget);
    register('lookout',lookoutTarget,'SEA LOOKOUT','LOOK OUT OVER THE WATER',()=>{
      if(!state.cliffSeen){state.cliffSeen=true;nightValue=.82;notify('The sea is moving, but no wave makes a sound. A shape stands among the trees behind you.');playSfx('knock');updateObjective();persist();}
      else notify('The water disappears into the dark.');
    },3.2);
    world.ground=ground;
  }

  function buildDeer() {
    deer=new THREE.Group();deer.position.set(-4.8,0,-18.2);scene.add(deer);
    sphere(deer,.62,.48,.96,materials.deerFur,0,1.55,0,16);
    sphere(deer,.32,.48,.36,materials.deerFur,0,2.0,-.52,14).rotation.x=-.4;
    sphere(deer,.27,.25,.37,materials.deerFur,0,2.34,-.78,14);
    sphere(deer,.12,.11,.14,materials.deerDark,0,2.28,-1.08,10);
    sphere(deer,.19,.12,.28,materials.deerFur,0,1.75,.82,10);
    sphere(deer,.075,.12,.18,materials.deerFur,0,1.42,1.0,8);
    for(const x of [-.19,.19]){
      const eye=sphere(deer,.04,.04,.04,new THREE.MeshStandardMaterial({color:0x1b1715,roughness:.2}),x,2.42,-.94,8);
      // Small ears are visible against the snow.
      const ear=sphere(deer,.09,.045,.18,materials.deerFur,x*1.6,2.48,-.64,8);ear.rotation.z=x<0?-.35:.35;
    }
    for(const x of [-.34,.34]) for(const z of [-.62,.6]){
      const leg=new THREE.Group();leg.position.set(x,1.28,z);deer.add(leg);
      cylinder(leg,.07,.09,.78,materials.deerDark,0,-.37,0,8);
      cylinder(leg,.065,.075,.22,materials.deerDark,0,-.84,-.02,8);
      deerLegs.push(leg);
    }
    // Branching antlers.
    for(const side of [-1,1]){
      const base=cylinder(deer,.045,.07,.42,materials.antler,side*.16,2.58,-.76,8,[0,0,side*.35]);
      const main=cylinder(deer,.025,.045,.65,materials.antler,side*.29,2.95,-.76,7,[0,0,side*.12]);
      for(let j=0;j<3;j++) cylinder(deer,.018,.027,.28,materials.antler,side*(.36+j*.1),3.17+j*.1,-.76,6,[0,0,side*(.65+j*.15)]);
    }
    register('deer',deer,'DEER','WATCH THE DEER',()=>{
      if(!state.deerSeen){state.deerSeen=true;notify('It watches you for a moment, then moves between the trees. No sound from its hooves.');updateObjective();persist();}
      else notify('The tracks continue toward the cliff.');
    },5.8);
  }

  function buildVisitor() {
    visitor=new THREE.Group();visitor.position.set(7.4,0,-20.8);scene.add(visitor);visitor.visible=false;
    const shell=new THREE.MeshStandardMaterial({color:0x10171c,roughness:1,transparent:true,opacity:.92});
    sphere(visitor,.42,.62,.28,shell,0,1.25,0,12);
    cylinder(visitor,.23,.34,.86,shell,0,.52,0,10);
    sphere(visitor,.22,.26,.22,shell,0,2.0,-.02,12);
    const face=new THREE.MeshStandardMaterial({color:0x05090d,roughness:1});
    sphere(visitor,.15,.18,.03,face,0,2.0,-.22,10);
    for(const x of [-.15,.15]){
      cylinder(visitor,.09,.12,.82,shell,x,.76,-.02,8,[0,0,x<0?-.08:.08]);
      cylinder(visitor,.08,.1,.9,shell,x*1.1,.2,0,8,[0,0,x<0?-.04:.04]);
    }
    visitor.visible=false;
  }

  function buildParticles() {
    const count=settings.quality==='low'?130:(isTouch?180:330);
    snowPositions=new Float32Array(count*3);snowVelocities=new Float32Array(count);
    for(let i=0;i<count;i++){snowPositions[i*3]=(Math.random()-.5)*44;snowPositions[i*3+1]=Math.random()*13;snowPositions[i*3+2]=-8-Math.random()*36;snowVelocities[i]=.8+Math.random()*1.4;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(snowPositions,3));
    snowPoints=new THREE.Points(geo,new THREE.PointsMaterial({color:0xe6edf0,size:isTouch?.045:.055,transparent:true,opacity:.62,depthWrite:false}));scene.add(snowPoints);
    const dc=110;const dp=new Float32Array(dc*3);for(let i=0;i<dc;i++){dp[i*3]=(Math.random()-.5)*9;dp[i*3+1]=Math.random()*3.3;dp[i*3+2]=(Math.random()-.5)*8;}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
    dustPoints=new THREE.Points(dg,new THREE.PointsMaterial({color:0xf2c999,size:.025,transparent:true,opacity:.25,depthWrite:false}));dustPoints.position.set(0,0,0);scene.add(dustPoints);
  }

  function buildLantern() {
    lanternRig=new THREE.Group();camera.add(lanternRig);scene.add(camera);
    const brass=new THREE.MeshStandardMaterial({color:0x91744e,metalness:.65,roughness:.35});
    const glass=new THREE.MeshStandardMaterial({color:0xffc27d,emissive:0xff9f50,emissiveIntensity:1.5,transparent:true,opacity:.75});
    cylinder(lanternRig,.09,.09,.2,brass,.34,-.29,-.48,12);
    cylinder(lanternRig,.066,.066,.16,glass,.34,-.29,-.48,12);
    cylinder(lanternRig,.12,.1,.045,brass,.34,-.18,-.48,12);
    const loop=new THREE.Mesh(new THREE.TorusGeometry(.075,.012,6,12,Math.PI),brass);loop.position.set(.34,-.105,-.48);lanternRig.add(loop);
    lanternRig.visible=false;
    lanternPoint=new THREE.PointLight(0xffbf7e,0,7,2);lanternPoint.position.set(.34,-.28,-.55);camera.add(lanternPoint);
    lanternSpot=new THREE.SpotLight(0xffd39b,0,14,Math.PI/5,.55,1.3);lanternSpot.position.set(.34,-.23,-.6);lanternSpot.target.position.set(.34,-.7,-5.5);camera.add(lanternSpot,lanternSpot.target);
  }

  function initAudio() {
    ambientAudio=new Audio('./assets/white_noise_ambient.mp3');ambientAudio.loop=true;ambientAudio.volume=settings.volume/100*.42;ambientAudio.preload='auto';
  }
  function startAudio() {
    if(audioStarted)return;audioStarted=true;
    try { ambientAudio?.play().catch(()=>{}); } catch {}
    try { audioCtx=new (window.AudioContext||window.webkitAudioContext)(); } catch {}
    playSfx('softStart');
  }
  function playSfx(type) {
    if(!audioCtx||settings.volume===0)return;
    const ctx=audioCtx;const now=ctx.currentTime;const master=ctx.createGain();master.gain.value=settings.volume/100*.28;master.connect(ctx.destination);
    if(type==='door'||type==='creak'){
      const osc=ctx.createOscillator(),g=ctx.createGain(),filter=ctx.createBiquadFilter();osc.type='sawtooth';osc.frequency.setValueAtTime(type==='door'?94:72,now);osc.frequency.exponentialRampToValueAtTime(34,now+.5);filter.type='lowpass';filter.frequency.value=240;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.35,now+.04);g.gain.exponentialRampToValueAtTime(.0001,now+.62);osc.connect(filter).connect(g).connect(master);osc.start(now);osc.stop(now+.65);
    }else if(type==='knock'){
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='triangle';o.frequency.setValueAtTime(90,now);o.frequency.exponentialRampToValueAtTime(48,now+.11);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.5,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+.2);o.connect(g).connect(master);o.start(now);o.stop(now+.22);
    }else if(type==='radio'||type==='static'){
      const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.5),ctx.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);
      const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buffer;filter.type='bandpass';filter.frequency.value=type==='radio'?1300:1800;filter.Q.value=.8;g.gain.value=.22;src.connect(filter).connect(g).connect(master);src.start(now);
    }else if(type==='softStart'){
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(48,now);o.frequency.exponentialRampToValueAtTime(74,now+1.2);g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(.12,now+.5);g.gain.exponentialRampToValueAtTime(.0001,now+1.7);o.connect(g).connect(master);o.start(now);o.stop(now+1.8);
    }else if(type==='step'){
      const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();o.type='triangle';o.frequency.setValueAtTime(68+Math.random()*22,now);f.type='lowpass';f.frequency.value=160;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.17,now+.015);g.gain.exponentialRampToValueAtTime(.0001,now+.12);o.connect(f).connect(g).connect(master);o.start(now);o.stop(now+.13);
    }else if(type==='chime'){
      const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=330;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.13,now+.03);g.gain.exponentialRampToValueAtTime(.0001,now+1.2);o.connect(g).connect(master);o.start(now);o.stop(now+1.3);
    }
    setTimeout(()=>{try{master.disconnect()}catch{}},2200);
  }

  function initUI() {
    const saved = loadSave();$('btn-continue').disabled=!saved||!!saved.state?.ended;
    refreshBindings();
    document.querySelectorAll('[data-bind]').forEach(b=>b.addEventListener('click',()=>{bindingTarget=b.dataset.bind;refreshBindings();}));
    $('volume-range').value=settings.volume;$('volume-value').textContent=settings.volume;
    $('sensitivity-range').value=settings.sensitivity;$('sensitivity-value').textContent=settings.sensitivity;
    $('quality-select').value=settings.quality;$('grain-range').value=settings.grain;$('grain-value').textContent=settings.grain;
    $('film-grain').style.opacity=String(settings.grain/100*.42);
    $('volume-range').addEventListener('input',e=>{settings.volume=+e.target.value;$('volume-value').textContent=settings.volume;if(ambientAudio)ambientAudio.volume=settings.volume/100*.42;saveSettings();});
    $('sensitivity-range').addEventListener('input',e=>{settings.sensitivity=+e.target.value;$('sensitivity-value').textContent=settings.sensitivity;saveSettings();});
    $('quality-select').addEventListener('change',e=>{settings.quality=e.target.value;saveSettings();notify('Quality setting saved. Reload the page to apply the full change.');});
    $('grain-range').addEventListener('input',e=>{settings.grain=+e.target.value;$('grain-value').textContent=settings.grain;$('film-grain').style.opacity=String(settings.grain/100*.42);saveSettings();});
  }

  function bindEvents() {
    $('btn-new').addEventListener('click',()=>beginGame(false));
    $('btn-continue').addEventListener('click',()=>beginGame(true));
    $('btn-settings').addEventListener('click',()=>showPanel('settings'));
    $('btn-controls').addEventListener('click',()=>showPanel('controls'));
    $('btn-credits').addEventListener('click',()=>showPanel('credits'));
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{b.closest('.panel-screen').classList.add('hidden');if(b.dataset.close==='settings'&&settingsFromPause){settingsFromPause=false;$('pause-screen').classList.remove('hidden');}else if(!gameActive){$('main-menu').classList.remove('hidden');}}));
    $('btn-resume').addEventListener('click',resumeGame);

    $('btn-quit').addEventListener('click',()=>{paused=false;gameActive=false;showMenu();});
    $('btn-pause-settings').addEventListener('click',()=>{settingsFromPause=true;showPanel('settings');});
    $('radio-close').addEventListener('click',closeRadio);
    $('radio-range').addEventListener('input',e=>{radioFrequency=+e.target.value/10;$('radio-frequency-value').textContent=radioFrequency.toFixed(1);playSfx('static');updateRadioStatus();});
    $('radio-minus').addEventListener('click',()=>setRadio(radioFrequency-.1));
    $('radio-plus').addEventListener('click',()=>setRadio(radioFrequency+.1));
    $('radio-lock').addEventListener('click',()=>{
      if(Math.abs(radioFrequency-103.2)<.35){
        state.radioTuned=true;playSfx('chime');$('radio-status').textContent='A VOICE COMES THROUGH THE STATIC: “DO NOT OPEN THE DOOR TWICE.”';notify('A voice, very far away, says your name.');updateObjective();persist();
      }else{playSfx('radio');$('radio-status').textContent='A FEW WORDS, THEN STATIC. KEEP SEARCHING.';}
    });
    $('btn-ending-menu').addEventListener('click',()=>{state.ended=true;gameActive=false;showMenu();});
    $('intro-skip').addEventListener('click',stopIntro);
    canvas.addEventListener('click',()=>{if(gameActive&&!paused&&!isTouch&&document.pointerLockElement!==canvas)canvas.requestPointerLock?.();});
    document.addEventListener('pointerlockchange',()=>{});
    document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&gameActive&&!paused){yaw-=e.movementX*.0022*(settings.sensitivity/75);pitch-=e.movementY*.0018*(settings.sensitivity/75);pitch=THREE.MathUtils.clamp(pitch,-1.35,1.35);}});
    document.addEventListener('keydown',e=>{
      if(bindingTarget){
        e.preventDefault();
        if(e.code==='Escape'){bindingTarget=null;refreshBindings();return;}
        if(['Tab','ControlLeft','ControlRight','AltLeft','AltRight','MetaLeft','MetaRight','CapsLock'].includes(e.code))return;
        const action=bindingTarget,previous=bindings[action];
        const collision=Object.keys(bindings).find(k=>k!==action&&bindings[k]===e.code);
        if(collision)bindings[collision]=previous;
        bindings[action]=e.code;bindingTarget=null;saveBindings();refreshBindings();return;
      }
      if(e.code==='Escape'){
        if(radioOpen){closeRadio();return;}
        if(gameActive){if(paused)resumeGame();else pauseGame();}
      }
      if(!gameActive||paused||introActive)return;
      if(Object.values(bindings).includes(e.code)) keys[e.code]=true;
      if(e.code===bindings.interact)interact();
      if(e.code===bindings.lantern)toggleLantern();
    });
    document.addEventListener('keyup',e=>{keys[e.code]=false;});
    $('mobile-use').addEventListener('pointerdown',e=>{e.preventDefault();interact();});
    $('mobile-lantern').addEventListener('pointerdown',e=>{e.preventDefault();toggleLantern();});
    $('mobile-run').addEventListener('pointerdown',e=>{e.preventDefault();mobileRun=true;});
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>$('mobile-run').addEventListener(ev,()=>mobileRun=false));
    const stick=$('touch-stick'),knob=$('stick-knob');
    stick.addEventListener('pointerdown',e=>{e.preventDefault();stick.setPointerCapture(e.pointerId);moveStick(e);});
    stick.addEventListener('pointermove',e=>{if(e.buttons)moveStick(e);});
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>stick.addEventListener(ev,()=>{touchMove.x=touchMove.z=0;knob.style.transform='translate(-50%,-50%)';}));
    function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=43,len=Math.hypot(dx,dy)||1,scale=Math.min(1,max/len);const x=dx*scale,y=dy*scale;touchMove.x=x/max;touchMove.z=-y/max;knob.style.transform=`translate(calc(-50% + ${x}px),calc(-50% + ${y}px))`;}
    canvas.addEventListener('pointerdown',e=>{if(!isTouch||!gameActive||paused)return;if(e.clientX>innerWidth*.42){lookPointer=e.pointerId;lookLast={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}});
    canvas.addEventListener('pointermove',e=>{if(isTouch&&lookPointer===e.pointerId&&gameActive&&!paused){const dx=e.clientX-lookLast.x,dy=e.clientY-lookLast.y;lookLast={x:e.clientX,y:e.clientY};yaw-=dx*.005*(settings.sensitivity/75);pitch=THREE.MathUtils.clamp(pitch-dy*.004*(settings.sensitivity/75),-1.35,1.35);}});
    ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>canvas.addEventListener(ev,()=>lookPointer=null));
    window.addEventListener('resize',onResize);
    window.addEventListener('orientationchange',checkOrientation);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&gameActive&&!paused)pauseGame();});
    checkOrientation();
  }
  function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);renderer.setPixelRatio(Math.min(devicePixelRatio||1,isTouch?1:1.5));checkOrientation();}
  function checkOrientation(){const warning=$('orientation-warning');if(isTouch&&gameActive&&!paused&&innerHeight>innerWidth)warning.classList.remove('hidden');else warning.classList.add('hidden');}

  function showMenu() {
    inMenu=true;gameActive=false;paused=false;
    $('main-menu').classList.remove('hidden');$('game-hud').classList.add('hidden');$('mobile-ui').classList.add('hidden');
    ['settings-screen','controls-screen','credits-screen','pause-screen','ending-screen','radio-screen','intro-screen'].forEach(id=>$(id).classList.add('hidden'));
    camera.position.set(13.5,4.2,11.5);camera.lookAt(0,1.5,-1.5);
    const saved = loadSave();$('btn-continue').disabled=!saved||!!saved.state?.ended;
    document.exitPointerLock?.();
  }
  function showPanel(name) {
    $('main-menu').classList.add('hidden');$('pause-screen').classList.add('hidden');
    $(`${name}-screen`).classList.remove('hidden');
  }
  function beginGame(continueSaved) {
    startAudio();
    $('main-menu').classList.add('hidden');$('game-hud').classList.remove('hidden');$('mobile-ui').classList.toggle('hidden',!isTouch);
    $('settings-screen').classList.add('hidden');$('controls-screen').classList.add('hidden');$('credits-screen').classList.add('hidden');$('ending-screen').classList.add('hidden');
    if(continueSaved)applySave(loadSave());
    else {
      Object.assign(state,{stage:0,radioTuned:false,woodTaken:false,woodAdded:false,outsideSeen:false,deerSeen:false,cliffSeen:false,tapeFound:false,porchOn:false,visitorResolved:false,ended:false,lanternTaken:false,inspectCount:0});
      camera.position.set(0,1.65,3.5);yaw=0;pitch=0;nightValue=.08;gameSeconds=0;stepTimer=0;doorOpen=false;doorPivot.rotation.y=0;stoveLit=false;porchOn=false;lanternAvailable=false;lanternOn=false;lanternRig.visible=false;if(world.lanternProp)world.lanternProp.visible=true;if(world.hatch)world.hatch.rotation.x=0;porchLight.intensity=0;if(world.porchBulb)world.porchBulb.material=materials.metal;fireLight.intensity=.8;deerState='idle';deerClock=0;deer.visible=true;deer.position.set(-4.8,0,-18.2);visitorVisible=false;visitor.visible=false;visitorTimer=0;radioFrequency=89.7;$('radio-range').value=897;$('radio-frequency-value').textContent='89.7';
      updateObjective();persist();
    }
    inMenu=false;gameActive=true;paused=false;moveVX=0;moveVZ=0;camera.rotation.set(pitch,yaw,0);clock.getDelta();
    if(!continueSaved)startIntro(); else stopIntro();
    checkOrientation();
    if(!isTouch)canvas.requestPointerLock?.();
    if(isTouch){$('mobile-ui').classList.remove('hidden');}
  }
  function startIntro(){introActive=true;introElapsed=0;introStartZ=3.5;$('intro-screen').classList.remove('hidden');$('intro-line').textContent='DECEMBER 14, 2004 — 18:42 EST';$('intro-line').classList.remove('visible');$('intro-skip').classList.remove('hidden');}
  function stopIntro(){introActive=false;$('intro-screen').classList.add('hidden');}
  function updateIntro(dt){introElapsed+=dt;camera.position.z=THREE.MathUtils.lerp(introStartZ,1.7,Math.min(1,introElapsed/7.5));camera.position.x=Math.sin(introElapsed*.23)*.12;camera.rotation.set(-.025+Math.sin(introElapsed*.16)*.008,0,0);const lines=[['DECEMBER 14, 2004 — 18:42 EST',.1],['THE COAST ROAD CLOSED BEFORE THE SNOW STARTED.',2.3],['YOU HAVE NOT HEARD A HUMAN VOICE IN THREE DAYS.',4.7],['THE RADIO IS ALREADY WARM.',6.8]];let chosen=lines[0][0];for(const [line,time] of lines)if(introElapsed>=time)chosen=line;$('intro-line').textContent=chosen;$('intro-line').classList.toggle('visible',introElapsed>.35);if(introElapsed>8.6)stopIntro();}
  function pauseGame(){moveVX=0;moveVZ=0;paused=true;$('pause-screen').classList.remove('hidden');$('mobile-ui').classList.add('hidden');document.exitPointerLock?.();}
  function resumeGame(){paused=false;$('pause-screen').classList.add('hidden');if(isTouch)$('mobile-ui').classList.remove('hidden');else canvas.requestPointerLock?.();checkOrientation();}
  function updateObjective() {
    let title='CHECK THE RADIO',sub='The receiver is already warm.';
    if(state.radioTuned&&!state.woodAdded){title='FEED THE STOVE';sub=state.woodTaken?'Put the logs beside the iron stove.':'Take a couple of logs from the stack.';}
    else if(state.woodAdded&&!state.cliffSeen){title='LOOK TOWARD THE SEA';sub='The old lookout is just beyond the tree line.';}
    else if(state.cliffSeen&&!state.tapeFound){title='RETURN TO THE CABIN';sub='There was something under the floorboards.';}
    else if(state.tapeFound&&(!state.radioTuned||!state.porchOn)){title='MAKE THE SIGNAL CLEAR';sub='Tune 103.2 MHz and switch on the porch light.';}
    else if(state.tapeFound&&state.radioTuned&&state.porchOn&&!state.visitorResolved){title='WAIT FOR THE STATIC TO BREAK';sub='Do not step beyond the porch.';}
    else if(state.visitorResolved){title='LISTEN TO THE LAST RECORDING';sub='The cassette is waiting beside the receiver.';}
    $('objective-text').textContent=title;$('objective-sub').textContent=sub;
  }
  function notify(text,duration=3.8){const el=$('message-toast');el.textContent=text.toUpperCase();el.classList.add('show');toastTimer=duration;}
  function openRadio(){shouldRelockAfterRadio=document.pointerLockElement===canvas;if(shouldRelockAfterRadio)document.exitPointerLock?.();radioOpen=true;$('radio-screen').classList.remove('hidden');$('radio-range').value=Math.round(radioFrequency*10);$('radio-frequency-value').textContent=radioFrequency.toFixed(1);updateRadioStatus();playSfx('radio');}
  function closeRadio(){radioOpen=false;$('radio-screen').classList.add('hidden');if(shouldRelockAfterRadio&&gameActive&&!paused){canvas.requestPointerLock?.();}shouldRelockAfterRadio=false;}
  function setRadio(v){radioFrequency=THREE.MathUtils.clamp(Math.round(v*10)/10,88,108);$('radio-range').value=Math.round(radioFrequency*10);$('radio-frequency-value').textContent=radioFrequency.toFixed(1);updateRadioStatus();playSfx('static');}
  function updateRadioStatus(){if(state.radioTuned){$('radio-status').textContent='SIGNAL LOCKED. A DISTANT VOICE IS STILL THERE.';return;}$('radio-status').textContent=Math.abs(radioFrequency-103.2)<.35?'THE STATIC HAS A PATTERN. PRESS LISTEN.':'JUST STATIC. TURN THE DIAL SLOWLY.';}
  function toggleLantern(){if(!lanternAvailable){notify('The lantern is still on the small table.');return;}lanternOn=!lanternOn;lanternRig.visible=lanternOn;lanternPoint.intensity=lanternOn?3.6:0;lanternSpot.intensity=lanternOn?11:0;playSfx('chime');notify(lanternOn?'The lantern gives off a steady amber glow.':'The lantern goes dark.');}
  function togglePorch(){porchOn=!porchOn;state.porchOn=porchOn;porchLight.intensity=porchOn?3.2:0;if(world.porchBulb)world.porchBulb.material=porchOn?materials.warmGlass:materials.metal;playSfx('chime');notify(porchOn?'The porch bulb comes on. Snow turns gold for a moment.':'The porch light goes out.');updateObjective();checkVisitorResolution();persist();}
  function interact() {
    if(!gameActive||paused||radioOpen||introActive)return;
    if(!currentTarget){notify('There is nothing close enough to interact with.',1.8);return;}
    currentTarget.callback();playSfx('chime');
  }

  function updateTarget() {
    if(!gameActive||paused||radioOpen){$('interaction-prompt').classList.add('hidden');currentTarget=null;return;}
    const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    let best=null,bestScore=-1;
    for(const item of interactions){
      if(item.id==='deer'&&deerState==='gone')continue;
      if(item.id==='door'&&doorOpen&&camera.position.z<-6.8&&camera.position.z>-3.5){} // can still close from either side
      const pos=new THREE.Vector3();item.object.getWorldPosition(pos);const dx=pos.x-camera.position.x,dz=pos.z-camera.position.z;const dist=Math.hypot(dx,dz);
      if(dist>item.maxDist||dist<.1)continue;
      const dot=(dx*forward.x+dz*forward.z)/dist;
      if(dot<.38)continue;
      const score=dot-dist*.045;
      if(score>bestScore){bestScore=score;best=item;}
    }
    currentTarget=best;
    const prompt=$('interaction-prompt');
    if(best){$('prompt-text').textContent=best.hint;prompt.querySelector('kbd').textContent=isTouch?'TAP':keyLabel(bindings.interact);prompt.classList.remove('hidden');}
    else prompt.classList.add('hidden');
  }

  function canMoveTo(x,z) {
    const r=.34;
    // Keep the player in the designed, walkable pocket of forest.
    if(x<-23||x>23||z>11||z<-30.2)return false;
    if(z<-30.0&&Math.abs(x)<30)return false;
    for(const c of colliders){
      if(c.tag==='tree'&&Math.hypot(x-c.x,z-c.z)>1.1)continue;
      const cx=THREE.MathUtils.clamp(x,c.x-c.hx,c.x+c.hx),cz=THREE.MathUtils.clamp(z,c.z-c.hz,c.z+c.hz);
      if((x-cx)*(x-cx)+(z-cz)*(z-cz)<r*r)return false;
    }
    // Cabin boundary. The central doorway is open only when the door is open.
    if(z>-5.22&&z<5.22&&(x<-5.55||x>5.55))return false;
    if(z>4.7&&z<5.6)return false;
    if(z<-4.76&&z>-5.4&&!doorOpen&&x>-.82&&x<.82)return false;
    return true;
  }
  function updateMovement(dt) {
    const kx=(keys[bindings.right]?1:0)-(keys[bindings.left]?1:0)+touchMove.x;
    const kz=(keys[bindings.forward]?1:0)-(keys[bindings.backward]?1:0)+touchMove.z;
    const len=Math.hypot(kx,kz);const nx=len>1?kx/len:kx,nz=len>1?kz/len:kz;
    const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    const wantsMove=Math.abs(nx)+Math.abs(nz)>.05;
    const sprint=!!keys[bindings.run]||mobileRun;
    const speed=sprint?4.0:2.25;
    const desiredX=(right.x*nx+forward.x*nz)*speed;
    const desiredZ=(right.z*nx+forward.z*nz)*speed;
    const response=1-Math.exp(-dt*(wantsMove?10:13));
    moveVX+= (desiredX-moveVX)*response;moveVZ+=(desiredZ-moveVZ)*response;
    const dx=moveVX*dt, dz=moveVZ*dt;
    const oldX=camera.position.x,oldZ=camera.position.z;
    if(canMoveTo(oldX+dx,oldZ))camera.position.x+=dx;else moveVX=0;
    if(canMoveTo(camera.position.x,oldZ+dz))camera.position.z+=dz;else moveVZ=0;
    const moved=Math.hypot(camera.position.x-oldX,camera.position.z-oldZ);
    if(moved>.001){
      stepTimer-=dt*(sprint?1.1:.8);
      if(stepTimer<=0){playSfx('step');stepTimer=sprint?.32:.48;}
      camera.position.y=1.65+Math.sin(gameSeconds*(sprint?12:8))*(sprint?.024:.012);
    }else camera.position.y=THREE.MathUtils.lerp(camera.position.y,1.65,dt*5);
  }

  function updateWorld(dt) {
    gameSeconds+=dt;
    const outdoors=camera.position.z<-5.8;
    const targetNight=state.cliffSeen?1:Math.min(.66,0.08+gameSeconds/520);
    nightValue=THREE.MathUtils.lerp(nightValue,targetNight,dt*.055);
    const night=nightValue;
    const skyTop=new THREE.Color(0x718a9a).lerp(new THREE.Color(0x111b28),night);
    const skyMid=new THREE.Color(0xb8c2c2).lerp(new THREE.Color(0x303a46),night);
    const skyLow=new THREE.Color(0x64717a).lerp(new THREE.Color(0x171e26),night);
    world.skyMat.uniforms.top.value.copy(skyTop);world.skyMat.uniforms.mid.value.copy(skyMid);world.skyMat.uniforms.low.value.copy(skyLow);world.skyMat.uniforms.night.value=night;
    scene.fog.color.copy(new THREE.Color(0xb6c2c7).lerp(new THREE.Color(0x1a2530),night));scene.fog.density=outdoors?(.011+night*.009):.004;
    moon.intensity=1.5-night*.72;hemi.intensity=.72-night*.46;ambient.intensity=.24-night*.16;
    renderer.toneMappingExposure=.95-night*.1;
    world.waterMat.uniforms.time.value=gameSeconds;world.waterMat.uniforms.night.value=night;
    fireLight.intensity=stoveLit?6.5+Math.sin(gameSeconds*8)*.8+Math.sin(gameSeconds*13)*.28:.2;
    tableLamp.intensity=stoveLit?4.4:2.4;
    if(lanternOn){lanternPoint.intensity=3.5+Math.sin(gameSeconds*8)*.14;lanternSpot.intensity=10.5;}
    const nowMins=18*60+42+Math.floor(gameSeconds*.12);const hh=String(Math.floor((nowMins/60)%24)).padStart(2,'0'),mm=String(nowMins%60).padStart(2,'0');$('time-text').textContent=`${hh}:${mm}`;
    $('location-name').textContent=outdoors?(camera.position.z<-25?'SEA LOOKOUT':'BLACK SPRUCE TRAIL'):'RANGER CABIN 06';
    $('location-detail').textContent=outdoors?'PENOBSCOT COUNTY · MAINE':'PENOBSCOT COUNTY · MAINE';
    // Snow drifts relative to the player but remains outside.
    snowPoints.visible=outdoors;
    if(outdoors){for(let i=0;i<snowVelocities.length;i++){const k=i*3;snowPositions[k+1]-=snowVelocities[i]*dt;snowPositions[k]+=Math.sin(gameSeconds*.7+i)*dt*.12;if(snowPositions[k+1]<camera.position.y-2){snowPositions[k+1]=camera.position.y+10+Math.random()*3;snowPositions[k]=camera.position.x+(Math.random()-.5)*42;snowPositions[k+2]=camera.position.z-8-Math.random()*32;}}snowPoints.geometry.attributes.position.needsUpdate=true;snowPoints.position.set(0,0,0);}
    dustPoints.visible=!outdoors;
    if(!state.cliffSeen&&camera.position.z<-17&&camera.position.z>-24&&!state.deerSeen){state.outsideSeen=true;updateObjective();}
    const deerPos=deer.position;
    if(deerState==='idle'&&Math.hypot(camera.position.x-deerPos.x,camera.position.z-deerPos.z)<5.4){deerState='run';deerClock=0;if(!state.deerSeen){state.deerSeen=true;notify('The deer turns its head. Then it slips between the trees.');updateObjective();persist();}}
    if(deerState==='idle'){deerLegs.forEach((l,i)=>l.rotation.x=Math.sin(gameSeconds*1.4+i)*.025);deer.rotation.y=Math.sin(gameSeconds*.7)*.06;}
    else if(deerState==='run'){
      deerClock+=dt;deer.position.x=THREE.MathUtils.lerp(deer.position.x,-1.0,dt*.55);deer.position.z-=dt*1.6;deer.rotation.y=-.3;
      deerLegs.forEach((l,i)=>l.rotation.x=Math.sin(gameSeconds*12+i*Math.PI)*.55);
      if(deerClock>7){deerState='gone';deer.visible=false;}
    }
    // The visitor never attacks. It is a distant, ambiguous figure at the treeline.
    if(state.cliffSeen&&!visitorVisible&&!state.visitorResolved){visitorVisible=true;visitor.visible=true;visitorTimer=0;notify('Three knocks travel through the trees.');playSfx('knock');}
    if(visitorVisible&&!state.visitorResolved){
      visitorTimer+=dt;
      visitor.position.y=Math.sin(gameSeconds*1.1)*.025;
      visitor.lookAt(camera.position.x,1.2,camera.position.z);
      if((visitorTimer>9&&visitorTimer<9.15)||(visitorTimer>16&&visitorTimer<16.15)){playSfx('knock');}
      if(visitorTimer>19&&porchOn&&state.radioTuned&&state.tapeFound){state.visitorResolved=true;visitor.visible=false;notify('The figure is gone. Only the radio is still speaking.');updateObjective();persist();}
    }
    checkVisitorResolution();
  }
  function checkVisitorResolution(){
    if(state.tapeFound&&state.radioTuned&&state.porchOn&&state.cliffSeen&&!state.visitorResolved){
      if(visitorVisible&&(lanternOn||porchOn)){state.visitorResolved=true;visitor.visible=false;notify('The silhouette loses its shape in the porch light.');updateObjective();persist();}
    }
  }
  function showEnding(){if(state.ended)return;state.ended=true;persist();playSfx('radio');gameActive=false;$('ending-screen').classList.remove('hidden');$('ending-copy').textContent='The cassette clicks off. Somewhere below the cliff, three slow knocks answer from the dark.';document.exitPointerLock?.();}

  function animate() {
    requestAnimationFrame(animate);
    const dt=Math.min(clock.getDelta(),.04);
    if(gameActive&&!paused){
      if(introActive){updateIntro(dt);}else{if(!radioOpen)updateMovement(dt);camera.rotation.set(pitch,yaw,0);updateWorld(dt);updateTarget();}
      if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('message-toast').classList.remove('show');}
    }
    // Menu camera gently watches the cabin; no fast camera motion.
    if(inMenu){camera.position.x=12.5+Math.sin(performance.now()*.00006)*.7;camera.position.y=4.2+Math.sin(performance.now()*.00009)*.06;camera.position.z=-12.0;camera.lookAt(0,1.5,-2.0);}
    renderer.render(scene,camera);
  }
}
