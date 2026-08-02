import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

let scene, camera, renderer, controls;
let textGroup = new THREE.Group();
let clock = new THREE.Clock();
let mouseX = 0, mouseY = 0;
let followCursor = false;
let originalZ = -2;
let originalRotation = new THREE.Euler();
let torchLight, torchBeam, torchTarget;
let glowMeshes = [];
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const particles = [];
let textMeshes = []; // Store text meshes for accurate intersection
let lastMouseX = 0;
let isMouseMoving = false;
let mouseIdleTimeout;
let returnStartTime = 0;
let isReturningToOriginal = false;
const returnDuration = 25; // Duration in seconds for smooth return




init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 40;

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);
  scene.add(textGroup);

  const loader = new FontLoader();
  loader.load('https://threejs.org/examples/fonts/helvetiker_bold.typeface.json', (font) => {
    const letters = 'DOT';
    const positions = [
      { x: -2.60, z: -0.40, rotY: -0.20 },
      { x:  0.00, z:  0.00, rotY:  0.00 },
      { x:  2.60, z: -0.40, rotY:  0.20 }
    ];

    for (let i = 0; i < letters.length; i++) {
      const geometryOuter = new TextGeometry(letters[i], {
        font: font,
        size: 5.2,
        height: 0.2,
        bevelEnabled: true,
        bevelThickness: 0.1,
        bevelSize: 0.2,
        bevelSegments: 6
      });
      geometryOuter.center();
      const materialOuter = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1,
        roughness: 0.2,
        emissive: 0x111111
      });
      const meshOuter = new THREE.Mesh(geometryOuter, materialOuter);
      meshOuter.position.set(positions[i].x, 0, positions[i].z);
      meshOuter.rotation.y = positions[i].rotY;
      textGroup.add(meshOuter);
      textMeshes.push(meshOuter);

      const geometryInner = new TextGeometry(letters[i], {
        font: font,
        size: 5,
        height: 0.005,
        bevelEnabled: false
      });
      geometryInner.center();
      const materialInner = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const meshInner = new THREE.Mesh(geometryInner, materialInner);
      meshInner.position.set(positions[i].x, 0, positions[i].z + 0.11);
      meshInner.rotation.y = positions[i].rotY;
      textGroup.add(meshInner);
      textMeshes.push(meshInner);

      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const glow = new THREE.Mesh(geometryInner.clone(), glowMat);
      glow.position.copy(meshInner.position);
      glow.scale.multiplyScalar(1.06);
      textGroup.add(glow);
      glowMeshes.push(glow);

      if (letters[i] === 'O') {
        const bbox = new THREE.Box3().setFromObject(meshInner);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const frontZ = bbox.max.z + 0.05;
        const torchPos = new THREE.Vector3(center.x, center.y, frontZ);

        torchLight = new THREE.SpotLight(0xffffff, 10, 50, Math.PI / 6, 0.2, 1.5);
        torchLight.position.copy(torchPos);
        torchLight.visible = false;

        torchTarget = new THREE.Object3D();
        torchTarget.position.set(center.x, center.y, frontZ + 5);
        torchLight.target = torchTarget;

        scene.add(torchLight);
        scene.add(torchTarget);

        const beamHeight = 50;
        const topRadius = 1;
        const bottomRadius = -10;
        const beamGeometry = new THREE.CylinderGeometry(topRadius, bottomRadius, beamHeight, 64, 1, true);
        beamGeometry.translate(0, -beamHeight / 2, 0);
        beamGeometry.rotateX(-Math.PI / 2);

        const colors = [];
        const positionAttr = beamGeometry.attributes.position;
        const vertexCount = positionAttr.count;
        for (let i = 0; i < vertexCount; i++) {
          const y = positionAttr.getY(i);
          const t = (y + beamHeight / 2) / beamHeight;
          const brightness = 1.0 - Math.pow(t, 1.5);
          colors.push(brightness, brightness, brightness);
        }
        beamGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const beamMaterial = new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 1.0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });

        torchBeam = new THREE.Mesh(beamGeometry, beamMaterial);
        torchBeam.position.copy(torchPos);
        torchBeam.visible = false;

        textGroup.add(torchBeam);
      }
    }

    textGroup.position.z = originalZ;
    originalRotation.copy(textGroup.rotation);
  });



window.addEventListener('mousemove', (e) => {
  mouseX = (e.clientX / window.innerWidth) * 2 - 1;
  mouseY = (e.clientY / window.innerHeight) * 2 - 1;

  // Track left-right movement
  if (mouseX !== lastMouseX) {
    isMouseMoving = true;
    isReturningToOriginal = false; // stop return animation
    clearTimeout(mouseIdleTimeout);
    mouseIdleTimeout = setTimeout(() => {
      isMouseMoving = false;
      isReturningToOriginal = true;
      returnStartTime = clock.getElapsedTime(); // start return
    }, 500); // wait 500ms before returning
    lastMouseX = mouseX;
  }

  if (!followCursor) {
    mouse.x = mouseX;
    mouse.y = -mouseY;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(textMeshes);
    if (intersects.length > 0) {
      const point = intersects[0].point;
      const baseColor = intersects[0].object.material.color.clone();
      for (let i = 0; i < 100; i++) {
        const offsetX = (Math.random() - 0.5) * 0.5;
        const offsetY = (Math.random() - 0.5) * 0.5;
        const offsetZ = (Math.random() - 0.5) * 0.5;
        const shape = Math.random() > 0.5
          ? new THREE.SphereGeometry(0.05, 4, 4)
          : new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const material = new THREE.MeshBasicMaterial({
          color: baseColor.clone(),
          transparent: true,
          opacity: 1
        });
        const particle = new THREE.Mesh(shape, material);
        particle.position.set(point.x + offsetX, point.y + offsetY, point.z + offsetZ);
        particle.userData = {
          lifetime: 1.5,
          velocity: new THREE.Vector3(offsetX, offsetY + 0.01, offsetZ)
        };
        scene.add(particle);
        particles.push(particle);
      }
    }
  }
});


  window.addEventListener('dblclick', () => {
    followCursor = !followCursor;
    glowMeshes.forEach(mesh => mesh.visible = !followCursor);
    animateMoveZ(followCursor ? originalZ - 10 : originalZ);
    if (torchLight) torchLight.visible = followCursor;
    if (torchBeam) torchBeam.visible = followCursor;
    if (!followCursor) resetRotation();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animateMoveZ(targetZ) {
  const duration = 0.6;
  const startZ = textGroup.position.z;
  const startTime = clock.getElapsedTime();
  function animateZ() {
    const elapsed = clock.getElapsedTime() - startTime;
    const t = Math.min(elapsed / duration, 1);
    textGroup.position.z = THREE.MathUtils.lerp(startZ, targetZ, t);
    if (t < 1) requestAnimationFrame(animateZ);
  }
  animateZ();
}

function resetRotation() {
  const startRot = textGroup.rotation.clone();
  const targetRot = originalRotation.clone();
  const duration = 0.6;
  const startTime = clock.getElapsedTime();
  function animateRotation() {
    const elapsed = clock.getElapsedTime() - startTime;
    const t = Math.min(elapsed / duration, 1);
    textGroup.rotation.x = THREE.MathUtils.lerp(startRot.x, targetRot.x, t);
    textGroup.rotation.y = THREE.MathUtils.lerp(startRot.y, targetRot.y, t);
    if (t < 1) requestAnimationFrame(animateRotation);
  }
  animateRotation();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
if (!followCursor) {
  if (isMouseMoving) {
    const targetY = mouseX * Math.PI / 15;
    textGroup.rotation.y += (targetY - textGroup.rotation.y) * 0.01;
  } else if (isReturningToOriginal) {
    const elapsed = clock.getElapsedTime() - returnStartTime;
    const t = Math.min(elapsed / returnDuration, 1); // normalize to [0,1]
    textGroup.rotation.y = THREE.MathUtils.lerp(textGroup.rotation.y, originalRotation.y, t);
    textGroup.rotation.x = THREE.MathUtils.lerp(textGroup.rotation.x, originalRotation.x, t);
    if (t >= 1) isReturningToOriginal = false;
  }
}
 else {
  // Full XY rotation when followCursor is enabled
  const targetX = mouseY * Math.PI / 15;
  const targetY = mouseX * Math.PI / 15;
  textGroup.rotation.x += (targetX - textGroup.rotation.x) * 0.1;
  textGroup.rotation.y += (targetY - textGroup.rotation.y) * 0.1;
}



  if (torchLight && torchTarget) {
    const torchForward = new THREE.Vector3(0, 0, 1).applyQuaternion(torchLight.quaternion).normalize();
    torchTarget.position.copy(torchLight.position).add(torchForward.multiplyScalar(60));
    torchLight.target.updateMatrixWorld();
  }
  if (torchBeam) {
    torchBeam.position.copy(torchLight.position);
    torchBeam.lookAt(torchTarget.position);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.lifetime -= clock.getDelta();
    p.position.add(p.userData.velocity);
    p.material.opacity = p.userData.lifetime / 1.5;
    if (p.userData.lifetime <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
}
