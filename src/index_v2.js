import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state, pushUndoState } from './state.js';
import { createGourdGeometry, GOURD_HEIGHT } from './gourd.js';
import { updatePatternGroup, animatePatternPulse } from './pattern.js';
import { calculateMeasurements, updateMeasureLines } from './measure.js';
import { handleCarvePointerDown, handleCarvePointerMove, handleCarvePointerUp, updateCarveGroup } from './carve.js';
import { renderPropertiesPanel, registerGlobalUIEvents, showToast, updatePhotoGuideOverlay } from './ui.js';

// Global variables
let scene, camera, renderer, controls;
let gourdMesh, patternGroup, measureGroup, carveGroup;
let gridHelper, rimLight;
let isPositionDragging = false;

let cameraTargetPos = null;
const cameraPresets = {
    front: new THREE.Vector3(0, 0.2, 5),
    side: new THREE.Vector3(5, 0.2, 0),
    top: new THREE.Vector3(0.01, 5, 0.01),
    persp: new THREE.Vector3(2.5, 1.8, 3.5),
};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(-999, -999);

// Initializer function
function init() {
    const canvas = document.getElementById('viewport-canvas');
    const viewport = document.getElementById('canvas-container');
    if (!canvas || !viewport) return;

    // 1. Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a09); // Dark background matching V2 deep theme
    scene.fog = new THREE.FogExp2(0x0c0a09, 0.05);

    // 2. Camera setup
    camera = new THREE.PerspectiveCamera(45, viewport.clientWidth / viewport.clientHeight, 0.1, 100);
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
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    const initH_three = (state.gourdHeight || 30.0) * 0.1;
    ground.position.y = -initH_three / 2 - 0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    gridHelper = new THREE.GridHelper(8, 32, 0x44403c, 0x292524);
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
        onUpdatePattern();
    };
    updateMeasureLines(measureGroup, unscaledMeas);
    updateCarveGroup(carveGroup, state);

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

    // 11. Tab Select Wiring
    document.querySelectorAll('.v2-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.v2-tab-btn').forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            state.activeTab = btn.dataset.v2Tab;
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    // Toolbar active classes synchronizer
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 12. Carving and positioning interaction event listeners (using capture phase to preempt controls)
    canvas.addEventListener('pointerdown', (e) => {
        if (state.currentTool === 'carve') {
            handleCarvePointerDown(e, canvas, camera, gourdMesh, carveGroup, state, controls, () => {
                pushUndoState(gourdMesh);
            });
        } else if (state.currentTool === 'position') {
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
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (state.currentTool === 'carve') {
            handleCarvePointerMove(e, canvas, camera, gourdMesh, carveGroup, state);
        } else if (state.currentTool === 'position' && isPositionDragging) {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObject(gourdMesh);
            if (hits.length > 0) {
                updatePositionDrag(hits[0]);
            }
            e.stopPropagation();
        }
    }, true);

    const onCarveEnd = (e) => {
        if (state.currentTool === 'carve') {
            handleCarvePointerUp(state, carveGroup, controls, () => {
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            });
        } else if (state.currentTool === 'position' && isPositionDragging) {
            isPositionDragging = false;
            controls.enabled = true;
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            e?.stopPropagation();
        }
    };
    canvas.addEventListener('pointerup', onCarveEnd, true);
    canvas.addEventListener('pointerleave', onCarveEnd, true);

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
            onUpdatePattern();

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

    // Hide Loading Screen Overlay
    setTimeout(() => {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('transition-opacity', 'duration-500', 'opacity-0');
            setTimeout(() => overlay.remove(), 550);
        }
    }, 850);

    // Start animation render loop
    animate(0);
}

// Resizes rendering buffers
function onResize() {
    const viewport = document.getElementById('canvas-container');
    if (!viewport || !camera || !renderer) return;
    camera.aspect = viewport.clientWidth / viewport.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}

// Sets camera presets and target lerping
function setCameraView(view) {
    cameraTargetPos = cameraPresets[view]?.clone();
    controls.target.set(0, 0.1, 0);
}

// Rendering callback updates
function onUpdatePattern() {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = `Drafting vessel (${state.patternCount} ${state.patternCountType.toLowerCase()})`;
    }
}

function onUpdateMeasure() {
    // Stats elements if needed
}

// Render loop clock
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    // 1. Camera Lerping to Preset Angle
    if (cameraTargetPos) {
        camera.position.lerp(cameraTargetPos, 0.08);
        if (camera.position.distanceTo(cameraTargetPos) < 0.01) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
        }
        controls.target.set(0, 0.1, 0);
    }

    // 2. Hover highlighting (non-carve mode)
    if (gourdMesh && state.currentTool !== 'carve') {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObject(gourdMesh);
        const targetIntensity = hits.length > 0 ? 0.06 : 0;
        
        gourdMesh.material.emissiveIntensity += (targetIntensity - gourdMesh.material.emissiveIntensity) * 0.15;
        gourdMesh.material.emissive.set(hits.length > 0 ? 0xD4A843 : 0x000000);
    }

    // 3. Pattern pulsing line glow
    if (patternGroup.visible && patternGroup.children.length > 0) {
        animatePatternPulse(patternGroup, state.patternOpacity, elapsed);
    }

    // 4. Rim light orbit rotation
    rimLight.position.x = Math.cos(elapsed * 0.35) * 3;
    rimLight.position.z = Math.sin(elapsed * 0.35) * 3;

    controls.update();
    renderer.render(scene, camera);
}

// Run initial configurations
init();
