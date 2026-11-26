import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// FPS Stats Class
class Stats {
  constructor() {
    this.dom = document.createElement('div');
    Object.assign(this.dom.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '100',
      padding: '6px 10px', background: 'rgba(0,0,0,0.7)',
      color: '#0f0', fontFamily: 'monospace', fontSize: '12px',
      lineHeight: '1.4', minWidth: '80px', pointerEvents: 'none',
      borderBottomRightRadius: '4px'
    });
    document.body.appendChild(this.dom);
    this.frames = 0;
    this.lastTime = performance.now();
    this.fps = 0;
    this.ms = 0;
  }
  begin() { this._start = performance.now(); }
  end() {
    this.frames++;
    const now = performance.now();
    this.ms = now - this._start;
    if (now - this.lastTime >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
      this.frames = 0;
      this.lastTime = now;
    }
    this.dom.innerHTML = `${this.fps} FPS<br>${this.ms.toFixed(1)} MS`;
  }
}

// Renderer Setup
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Background Gradient
function createBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0.0, '#5a504a');
  gradient.addColorStop(0.3, '#6b6058');
  gradient.addColorStop(0.5, '#7a6e64');
  gradient.addColorStop(0.7, '#6b6058');
  gradient.addColorStop(1.0, '#4a423c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
scene.background = createBackground();

// Environment for reflections
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// Camera
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2, 8);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.8;
controls.minDistance = 2;
controls.maxDistance = 20;
controls.target.set(0, 1, 0);
controls.enablePan = true;
controls.panSpeed = 0.5;
controls.update();

// Lighting
const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 2.5);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -8;
dirLight.shadow.camera.right = 8;
dirLight.shadow.camera.top = 8;
dirLight.shadow.camera.bottom = -8;
dirLight.shadow.bias = -0.0005;
dirLight.shadow.normalBias = 0.02;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xc4d4ff, 0.6);
fillLight.position.set(-4, 3, -5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffd4a0, 0.4);
rimLight.position.set(0, 2, -8);
scene.add(rimLight);

// Ground shadow plane
const groundGeo = new THREE.PlaneGeometry(30, 30);
const groundMat = new THREE.ShadowMaterial({ opacity: 0.25 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Stats
const stats = new Stats();

// Load Model
let mixer = null;
const clock = new THREE.Clock();
const progressBar = document.getElementById('progress');
const loadingDiv = document.getElementById('loading');

// Draco decoder (needed because LittlestTokyo.glb is Draco-compressed)
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

loader.load(
  'https://threejs.org/examples/models/gltf/LittlestTokyo.glb',
  (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 5 / maxDim;
    model.scale.setScalar(scale);
    model.position.sub(center.multiplyScalar(scale));
    model.position.y += (size.y * scale) / 2;

    scene.add(model);

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model);
      gltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }

    const targetY = model.position.y;
    controls.target.set(0, targetY, 0);
    camera.position.set(3, targetY + 2, 6);
    controls.update();

    loadingDiv.classList.add('hidden');
    setTimeout(() => { loadingDiv.style.display = 'none'; }, 800);
  },
  (progress) => {
    if (progress.total > 0) {
      progressBar.style.width = (progress.loaded / progress.total) * 100 + '%';
    }
  },
  (error) => {
    console.error('Error loading model:', error);
    document.querySelector('.loader-text').textContent = 'ERROR LOADING MODEL';
  }
);

// Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation Loop
function animate() {
  requestAnimationFrame(animate);
  stats.begin();

  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);

  controls.update();
  renderer.render(scene, camera);

  stats.end();
}

animate();
