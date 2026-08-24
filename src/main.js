import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state, pushUndoState } from './state.js';
import { createGourdGeometry, GOURD_HEIGHT, getGourdHeight } from './gourd.js';
import { updatePatternGroup, animatePatternPulse } from './pattern.js';
import { calculateMeasurements, updateMeasureLines } from './measure.js';
import { updateCarveGroup } from './carve.js';
import { renderPropertiesPanel, registerGlobalUIEvents, showToast, updatePhotoGuideOverlay } from './ui.js';

// Global variables
let scene, camera, renderer, controls;
let gourdMesh, patternGroup, measureGroup, carveGroup;
let gridHelper, ground, rimLight;
let isPositionDragging = false;
let pipRenderer = null, pipCamera = null, pipControls = null, isPipVisible = false;

let cameraTargetPos = null;
const cameraPresets = {
    front: new THREE.Vector3(0, 0.2, 5),
    side: new THREE.Vector3(5, 0.2, 0),
    top: new THREE.Vector3(0.01, 5, 0.01),
    persp: new THREE.Vector3(2.5, 1.8, 3.5),
};

let frameCount = 0, lastFpsTime = 0, currentFps = 60;
let idleTime = 0;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);
const clock = new THREE.Clock();

// Initializer function
function init() {
    const canvas = document.getElementById('viewport-canvas');
    const viewport = document.getElementById('viewport');
    if (!canvas || !viewport) return;

    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161618);
    scene.fog = new THREE.FogExp2(0x161618, 0.05);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(40, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
    camera.position.copy(cameraPresets.persp);

    // 3. Renderer setup
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // 4. Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 12;
    controls.target.set(0, 0.1, 0);
    controls.update();
    window.appControls = controls; // Expose globally for UI tool switching

    // 5. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.3);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 15;
    keyLight.shadow.camera.left = -2;
    keyLight.shadow.camera.right = 2;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -2;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc4d8f0, 0.4);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    rimLight = new THREE.PointLight(0xD4A843, 0.7, 8);
    rimLight.position.set(-1.5, 2, -3);
    scene.add(rimLight);

    const bottomFill = new THREE.PointLight(0x8899aa, 0.2, 5);
    bottomFill.position.set(0, -2, 1);
    scene.add(bottomFill);

    // 6. Ground & Grid helper
    const groundGeom = new THREE.PlaneGeometry(16, 16);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    const initH_three = (state.gourdHeight || 30.0) * 0.1;
    ground.position.y = -initH_three / 2 - 0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    gridHelper = new THREE.GridHelper(8, 32, 0x2a2a30, 0x222228);
    gridHelper.position.y = -initH_three / 2;
    scene.add(gridHelper);

    // 7. Gourd Mesh setup
    const gourdGeom = createGourdGeometry();
    const gourdMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(state.materialColor),
        roughness: state.materialRoughness,
        metalness: state.materialMetalness,
        side: THREE.DoubleSide,
    });
    gourdMesh = new THREE.Mesh(gourdGeom, gourdMat);
    gourdMesh.castShadow = true;
    gourdMesh.receiveShadow = true;
    scene.add(gourdMesh);

    // 8. Customizer Helper Groups (Added as children of gourdMesh so transformations inherit)
    patternGroup = new THREE.Group();
    gourdMesh.add(patternGroup);

    measureGroup = new THREE.Group();
    measureGroup.visible = false;
    gourdMesh.add(measureGroup);

    carveGroup = new THREE.Group();
    gourdMesh.add(carveGroup);

    // Initial calculations
    const unscaledMeas = calculateMeasurements(1.0, 1.0);
    updatePatternGroup(patternGroup, state);
    window.refreshPatternGroup = () => {
        updatePatternGroup(patternGroup, state);
        if (onUpdatePattern) onUpdatePattern();
    };
    updateMeasureLines(measureGroup, unscaledMeas);
    updateCarveGroup(carveGroup, state);

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            updateCarveGroup(carveGroup, state);
        });
    }

    // 9. Initial properties panel rendering and global events registration
    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
    updatePhotoGuideOverlay();
    
    registerGlobalUIEvents(
        gourdMesh, carveGroup, measureGroup, patternGroup,
        onUpdatePattern, onUpdateMeasure,
        setCameraView, gridHelper, scene, camera, renderer
    );

    // 10. Viewport resize observers
    const resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(viewport);
    onResize();

    // 11. Interactive positioning event listeners
    canvas.addEventListener('pointerdown', (e) => {
        idleTime = 0;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        if (state.currentTool === 'position') {
            if (state.positionToolMode === 'shape') {
                raycaster.setFromCamera(mouse, camera);
                const hits = raycaster.intersectObject(gourdMesh);
                if (hits.length > 0) {
                    isPositionDragging = true;
                    controls.enabled = false;
                    pushUndoState(gourdMesh);
                    updatePositionDrag(hits[0]);
                    e.stopPropagation(); // Stop OrbitControls from capturing this event!
                } else {
                    controls.enabled = true;
                }
            } else {
                controls.enabled = true;
            }
        }
    }, true);

    canvas.addEventListener('pointermove', (e) => {
        // Track mouse for hover rays
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (state.currentTool === 'position' && isPositionDragging) {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObject(gourdMesh);
            if (hits.length > 0) {
                updatePositionDrag(hits[0]);
            }
            e.stopPropagation(); // Stop event bubbling during shape dragging
        }
    }, true);

    const onPositionEnd = (e) => {
        if (state.currentTool === 'position' && isPositionDragging) {
            isPositionDragging = false;
            controls.enabled = true;
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            e?.stopPropagation();
        }
    };
    canvas.addEventListener('pointerup', onPositionEnd, true);
    canvas.addEventListener('pointerleave', onPositionEnd, true);

    // Dynamic direct slider synchronizer during dragging
    function updatePositionDrag(hit) {
        const activeZone = state.patternZones.find(z => z.id === state.activeZoneId);
        if (activeZone) {
            const uv = hit.uv;
            const t = uv.y;
            const theta = uv.x * 2.0 * Math.PI - Math.PI;

            activeZone.centerT = t;
            activeZone.centerTheta = theta;

            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();

            // Fast DOM values sync
            const tInputRange = document.getElementById(`pat-zone-centerT-${activeZone.id}`);
            const tInputNumber = tInputRange ? tInputRange.closest('.control-row-slider').querySelector('input[type="number"]') : null;
            if (tInputRange) tInputRange.value = t.toFixed(2);
            if (tInputNumber) tInputNumber.value = t.toFixed(2);

            const thetaDeg = Math.round(theta * 180 / Math.PI);
            const thetaInputRange = document.getElementById(`pat-zone-centerTheta-${activeZone.id}`);
            const thetaInputNumber = thetaInputRange ? thetaInputRange.closest('.control-row-slider').querySelector('input[type="number"]') : null;
            if (thetaInputRange) thetaInputRange.value = thetaDeg;
            if (thetaInputNumber) thetaInputNumber.value = thetaDeg;
        }
    }

    // Handle general interaction to reset idle timers
    canvas.addEventListener('wheel', () => { idleTime = 0; });

    // Update dimensions on badge HUD
    document.getElementById('badge-h').textContent = GOURD_HEIGHT.toFixed(2);
    document.getElementById('badge-w').textContent = unscaledMeas.maxDiameter.toFixed(2);

    // 12. Hide Loading Screen Overlay
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            setTimeout(() => overlay.remove(), 550);
        }
    }, 850);

    // Start animation render loop
    animate(0);
}

// Resizes rendering buffers
function onResize() {
    const viewport = document.getElementById('viewport');
    if (!viewport || !camera || !renderer) return;
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

let modelTargetRot = null;

// Smoothly animates model orientation to target pitch/yaw/roll degrees
export function animateModelRotation(xDeg, yDeg, zDeg, immediate = false) {
    if (!gourdMesh) return;
    state.modelRotationX = xDeg;
    state.modelRotationY = yDeg;
    state.modelRotationZ = zDeg;
    
    const deg2rad = Math.PI / 180;
    const targetEuler = new THREE.Euler(xDeg * deg2rad, yDeg * deg2rad, zDeg * deg2rad);
    
    if (immediate) {
        gourdMesh.rotation.copy(targetEuler);
        modelTargetRot = null;
    } else {
        modelTargetRot = targetEuler;
    }
}
window.animateModelRotation = animateModelRotation;

// Sets camera presets and sets target lerping
function setCameraView(view) {
    cameraTargetPos = cameraPresets[view]?.clone();
    document.querySelectorAll('.vp-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    idleTime = 0;
}

// Rendering callback updates
function onUpdatePattern() {
    const statLines = document.getElementById('stat-lines');
    const statLabel = document.getElementById('stat-lines-label');
    if (statLines) statLines.textContent = state.patternCount;
    if (statLabel) statLabel.textContent = state.patternCountType;
}

function onUpdateMeasure() {
    const stats = calculateMeasurements(gourdMesh.scale.x, gourdMesh.scale.y);
    
    // Refresh footer stats
    const vertsText = document.getElementById('stat-verts');
    const facesText = document.getElementById('stat-faces');
    
    if (vertsText) vertsText.textContent = gourdMesh.geometry.attributes.position.count;
    if (facesText) facesText.textContent = gourdMesh.geometry.index ? gourdMesh.geometry.index.count / 3 : gourdMesh.geometry.attributes.position.count / 3;
}

// Render loop
function animate(timestamp) {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // 1. Update FPS Counter
    frameCount++;
    if (elapsed - lastFpsTime >= 1.0) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsTime = elapsed;
        const fpsEl = document.getElementById('stat-fps');
        if (fpsEl) fpsEl.textContent = currentFps;
    }

    // 2. Camera Lerping to Preset Angle
    if (cameraTargetPos) {
        camera.position.lerp(cameraTargetPos, 0.08);
        if (camera.position.distanceTo(cameraTargetPos) < 0.01) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
        }
        controls.target.set(0, 0.1, 0);
    }

    // 2b. Smooth Model Rotation Lerping
    if (modelTargetRot && gourdMesh) {
        gourdMesh.rotation.x += (modelTargetRot.x - gourdMesh.rotation.x) * 0.16;
        gourdMesh.rotation.y += (modelTargetRot.y - gourdMesh.rotation.y) * 0.16;
        gourdMesh.rotation.z += (modelTargetRot.z - gourdMesh.rotation.z) * 0.16;
        
        if (Math.abs(modelTargetRot.x - gourdMesh.rotation.x) < 0.003 &&
            Math.abs(modelTargetRot.y - gourdMesh.rotation.y) < 0.003 &&
            Math.abs(modelTargetRot.z - gourdMesh.rotation.z) < 0.003) {
            gourdMesh.rotation.copy(modelTargetRot);
            modelTargetRot = null;
        }
    }

    // 3. Idle rotation disabled to keep model still during design
    idleTime += dt;

    // 4. Hover highlighting (non-carve mode, throttled when mouse is active)
    if (gourdMesh && state.currentTool !== 'carve' && mouse.x !== -999) {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(gourdMesh);
        const targetIntensity = hits.length > 0 ? 0.06 : 0;
        
        gourdMesh.material.emissiveIntensity += (targetIntensity - gourdMesh.material.emissiveIntensity) * 0.15;
        gourdMesh.material.emissive.set(hits.length > 0 ? 0xD4A843 : 0x000000);
    }

    // 5. Pattern pulsing line glow (only when patterns exist)
    if (patternGroup.visible && patternGroup.children.length > 0 && state.patternOpacity > 0) {
        animatePatternPulse(patternGroup, state.patternOpacity, elapsed);
    }

    // 6. Rim light orbit rotation
    rimLight.position.x = Math.cos(elapsed * 0.35) * 3;
    rimLight.position.z = Math.sin(elapsed * 0.35) * 3;

    // 7. Update status footer zoom indicator
    const dist = camera.position.distanceTo(controls.target);
    const zoomPct = Math.round(100 * 5 / Math.max(0.1, dist));
    const zoomEl = document.getElementById('stat-zoom');
    if (zoomEl) zoomEl.textContent = zoomPct;

    controls.update();
    renderer.render(scene, camera);

    // 8. Mobile Picture-in-Picture (WhatsApp Video Call style) 3D live viewport (lightweight pass)
    if (isPipVisible && pipRenderer && pipCamera && pipControls) {
        pipControls.update();
        const gridPrevVis = gridHelper ? gridHelper.visible : false;
        const groundPrevVis = ground ? ground.visible : false;
        const fogPrev = scene.fog;

        if (gridHelper) gridHelper.visible = false;
        if (ground) ground.visible = false;
        scene.fog = null;

        pipRenderer.render(scene, pipCamera);

        if (gridHelper) gridHelper.visible = gridPrevVis;
        if (ground) ground.visible = groundPrevVis;
        scene.fog = fogPrev;
    }
}

// Initialize Mobile Floating 3D PiP Viewer
function initPipViewer() {
    const pipCanvas = document.getElementById('pip-canvas');
    const pipBody = document.querySelector('.pip-body');
    if (!pipCanvas || !pipBody) return;

    pipCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    pipCamera.position.set(0, 0.0, 3.2);

    pipRenderer = new THREE.WebGLRenderer({ canvas: pipCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    pipRenderer.setClearColor(0x161618, 1.0);
    pipRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    pipRenderer.shadowMap.enabled = false; // High performance: No duplicate shadow map passes for thumbnail
    pipRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    pipRenderer.toneMappingExposure = 1.1;

    pipControls = new OrbitControls(pipCamera, pipCanvas);
    pipControls.enableDamping = true;
    pipControls.dampingFactor = 0.08;
    pipControls.minDistance = 0.8;
    pipControls.maxDistance = 8.0;
    pipControls.target.set(0, 0, 0);
    pipControls.autoRotate = false;
    pipControls.autoRotateSpeed = 2.5;

    let lastPipW = 0, lastPipH = 0;

    function frameGourdInPip() {
        if (!pipCamera || !pipControls) return;
        const gourdH = getGourdHeight(); // Total 3D height in world space (e.g. 3.0 units)
        const maxRadius = Math.max(
            (state.gourdBulbRadius || 9.0),
            (state.gourdNeckRadius || 3.8),
            (state.gourdBaseRadius || 3.5),
            (state.gourdRimRadius || 2.7)
        ) * 0.1;
        
        const aspect = Math.max(0.2, pipCamera.aspect || (180 / 240));
        const vFovRad = (pipCamera.fov * Math.PI) / 180;
        
        // Distance needed to fill vertical height cleanly (fills 95% of window)
        const distV = (gourdH / 2) / Math.tan(vFovRad / 2);
        // Distance needed to fit horizontal width
        const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * aspect);
        const distH = maxRadius / Math.tan(hFovRad / 2);
        
        const dist = Math.max(distV * 1.03, distH * 1.05);
        
        pipControls.target.set(0, 0, 0);
        
        const currentPos = pipCamera.position.clone();
        let angle = Math.atan2(currentPos.x, currentPos.z);
        if (isNaN(angle) || (currentPos.x === 0 && currentPos.z === 0)) angle = 0;
        
        pipCamera.position.set(
            Math.sin(angle) * dist,
            0.0,
            Math.cos(angle) * dist
        );
        pipControls.update();
    }

    function resizePip(force = false) {
        if (!pipCanvas || !pipRenderer || !pipCamera || !pipBody) return;
        const rect = pipBody.getBoundingClientRect();
        const width = Math.floor(rect.width || pipBody.clientWidth || 210);
        const height = Math.floor(rect.height || pipBody.clientHeight || 290);
        if (width > 0 && height > 0 && (force || Math.abs(width - lastPipW) > 2 || Math.abs(height - lastPipH) > 2)) {
            lastPipW = width;
            lastPipH = height;
            pipCamera.aspect = width / height;
            pipCamera.updateProjectionMatrix();
            pipRenderer.setSize(width, height, true);
            frameGourdInPip();
        }
    }

    // Attach ResizeObserver to auto-sync whenever the card is resized, opened, or animated
    if (window.ResizeObserver) {
        const ro = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0 && (Math.abs(width - lastPipW) > 2 || Math.abs(height - lastPipH) > 2)) {
                    lastPipW = Math.floor(width);
                    lastPipH = Math.floor(height);
                    pipCamera.aspect = width / height;
                    pipCamera.updateProjectionMatrix();
                    pipRenderer.setSize(lastPipW, lastPipH, true);
                    frameGourdInPip();
                }
            }
        });
        ro.observe(pipBody);
    }

    window.appPipViewer = {
        show: () => {
            isPipVisible = true;
            resizePip(true);
            setTimeout(() => resizePip(true), 60);
        },
        hide: () => {
            isPipVisible = false;
        },
        resize: () => resizePip(true),
        frame: frameGourdInPip,
        toggleRotate: () => {
            if (!pipControls) return false;
            pipControls.autoRotate = !pipControls.autoRotate;
            return pipControls.autoRotate;
        }
    };
}

// Run initial configurations
init();
initPipViewer();
