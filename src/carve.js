import * as THREE from 'three';
import { getSurfacePoint } from './pattern.js';
import { GOURD_HEIGHT } from './gourd.js';

let isDrawing = false;
let currentPath = [];
let tempLine = null;

// Starts a carve path on pointerdown
export function handleCarvePointerDown(e, canvas, camera, gourdMesh, carveGroup, state, controls, onStart) {
    if (state.currentTool !== 'carve') return;

    // Temporarily disable camera movement during carving
    controls.enabled = false;

    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const hits = raycaster.intersectObject(gourdMesh);

    if (hits.length > 0) {
        if (onStart) onStart(); // Captures the undo state before starting the carve

        isDrawing = true;
        currentPath = [];

        // Convert the hit point to the local coordinates of the gourd mesh
        const localPt = hits[0].point.clone().applyMatrix4(gourdMesh.matrixWorld.clone().invert());
        const t = Math.max(0, Math.min(1, (localPt.y + GOURD_HEIGHT / 2) / GOURD_HEIGHT));
        const theta = Math.atan2(localPt.z, localPt.x);

        currentPath.push({ t, theta });

        // Setup a temporary line to show drawing progress
        const mat = new THREE.LineBasicMaterial({
            color: new THREE.Color(state.carveColor),
            transparent: true,
            opacity: 0.9,
            depthTest: true,
            depthWrite: false
        });

        const pt3d = getSurfacePoint(t, theta, state.carveDepth);
        const geom = new THREE.BufferGeometry().setFromPoints([pt3d, pt3d.clone()]);
        tempLine = new THREE.Line(geom, mat);
        tempLine.renderOrder = 998;
        carveGroup.add(tempLine);
    }
}

// Continues a carve path on pointermove
export function handleCarvePointerMove(e, canvas, camera, gourdMesh, carveGroup, state) {
    if (!isDrawing || state.currentTool !== 'carve' || !tempLine) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
    const hits = raycaster.intersectObject(gourdMesh);

    if (hits.length > 0) {
        const localPt = hits[0].point.clone().applyMatrix4(gourdMesh.matrixWorld.clone().invert());
        const t = Math.max(0, Math.min(1, (localPt.y + GOURD_HEIGHT / 2) / GOURD_HEIGHT));
        const theta = Math.atan2(localPt.z, localPt.x);

        const lastPt = currentPath[currentPath.length - 1];
        // Calculate cylindrical coordinate distance to filter out mouse jitter
        const dt = t - lastPt.t;
        const dtheta = theta - lastPt.theta;
        const dist = Math.sqrt(dt * dt + dtheta * dtheta);

        if (dist > 0.012) {
            currentPath.push({ t, theta });

            // Redraw temporary line
            const pts3d = currentPath.map(p => getSurfacePoint(p.t, p.theta, state.carveDepth));
            tempLine.geometry.dispose();
            tempLine.geometry = new THREE.BufferGeometry().setFromPoints(pts3d);
        }
    }
}

// Commits the carve path on pointerup
export function handleCarvePointerUp(state, carveGroup, controls, onComplete) {
    if (!isDrawing) return;

    isDrawing = false;
    controls.enabled = true;

    // Clean up temporary line
    if (tempLine) {
        carveGroup.remove(tempLine);
        tempLine.geometry.dispose();
        tempLine.material.dispose();
        tempLine = null;
    }

    // Only save paths with sufficient coordinates
    if (currentPath.length > 1) {
        state.carvedPaths.push(currentPath);
        if (onComplete) onComplete();
    }

    currentPath = [];
}

// Rebuilds all permanent carved lines in the THREE.Group
export function updateCarveGroup(group, state) {
    while (group.children.length > 0) {
        const child = group.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        group.remove(child);
    }

    const color = new THREE.Color(state.carveColor);
    const mat = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false
    });

    for (const path of state.carvedPaths) {
        if (path.length < 2) continue;
        const pts = path.map(p => getSurfacePoint(p.t, p.theta, state.carveDepth));
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geom, mat);
        line.renderOrder = 998;
        group.add(line);
    }

    return state.carvedPaths.length;
}

// Clears all carvings
export function clearCarvings(group, state, onUpdate) {
    state.carvedPaths = [];
    updateCarveGroup(group, state);
    if (onUpdate) onUpdate();
}
