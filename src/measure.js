import * as THREE from 'three';
import { getGourdRadius, getGourdHeight } from './gourd.js';

// Calculates real-time geometry parameters scaled by the mesh transforms
export function calculateMeasurements(scaleX = 1.0, scaleY = 1.0) {
    let maxR = 0, maxRt = 0;
    for (let i = 0; i <= 100; i++) {
        const t = i / 100;
        const r = getGourdRadius(t);
        if (r > maxR) {
            maxR = r;
            maxRt = t;
        }
    }
    const neckR = getGourdRadius(0.55); // neck indentation is at 0.55 height
    const baseR = getGourdRadius(0.04);
    
    // Volume approximation using disc method (Riemann sum)
    let unscaledVolume = 0;
    const steps = 200;
    const H_three = getGourdHeight();
    for (let i = 0; i < steps; i++) {
        const t1 = i / steps, t2 = (i + 1) / steps;
        const r1 = getGourdRadius(t1), r2 = getGourdRadius(t2);
        unscaledVolume += Math.PI * ((r1 * r1 + r2 * r2) / 2) * (t2 - t1) * H_three;
    }
    
    // Surface area approximation using frustum lateral area segments
    let unscaledSurfaceArea = 0;
    for (let i = 0; i < steps; i++) {
        const t1 = i / steps, t2 = (i + 1) / steps;
        const r1 = getGourdRadius(t1), r2 = getGourdRadius(t2);
        const dy = (t2 - t1) * H_three;
        const dr = r2 - r1;
        const slant = Math.sqrt(dy * dy + dr * dr);
        unscaledSurfaceArea += 2 * Math.PI * ((r1 + r2) / 2) * slant;
    }

    // Multiply by 10.0 to convert Three.js units (0.1 ratio) back to centimeters
    return {
        height: H_three * 10.0 * scaleY,
        maxDiameter: maxR * 2 * 10.0 * scaleX,
        maxDiameterAt: Math.round(maxRt * 100),
        neckDiameter: neckR * 2 * 10.0 * scaleX,
        baseDiameter: baseR * 2 * 10.0 * scaleX,
        volume: unscaledVolume * 1000.0 * scaleX * scaleX * scaleY,
        surfaceArea: unscaledSurfaceArea * 100.0 * scaleX * scaleY
    };
}

// Renders the dimensional visualization lines in local coordinates
export function updateMeasureLines(group, unscaledMeas) {
    while (group.children.length > 0) {
        const c = group.children[0];
        c.geometry?.dispose();
        c.material?.dispose();
        group.remove(c);
    }

    const mat = new THREE.LineBasicMaterial({
        color: 0x5AAF6E,
        transparent: true,
        opacity: 0.8,
        depthTest: false // Ensures dimension lines stay visible over the gourd mesh
    });

    // Measurements display in local Three.js coordinate space
    const H_three = getGourdHeight();
    const maxR = (unscaledMeas.maxDiameter / 2) / 10.0;
    const wy = (unscaledMeas.maxDiameterAt / 100) * H_three - H_three / 2;

    // Height vertical line (positioned to the right)
    const hPts = [
        new THREE.Vector3(maxR + 0.25, -H_three / 2, 0),
        new THREE.Vector3(maxR + 0.25, H_three / 2, 0),
    ];
    const hLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPts), mat);
    hLine.renderOrder = 999;
    group.add(hLine);

    // Height horizontal end caps
    for (const y of [-H_three / 2, H_three / 2]) {
        const capPts = [
            new THREE.Vector3(maxR + 0.18, y, 0),
            new THREE.Vector3(maxR + 0.32, y, 0)
        ];
        const cap = new THREE.Line(new THREE.BufferGeometry().setFromPoints(capPts), mat);
        cap.renderOrder = 999;
        group.add(cap);
    }

    // Width horizontal line (across the widest point of the gourd)
    const wPts = [
        new THREE.Vector3(-maxR - 0.18, wy, 0),
        new THREE.Vector3(maxR + 0.18, wy, 0),
    ];
    const wLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(wPts), mat);
    wLine.renderOrder = 999;
    group.add(wLine);

    // Width vertical end caps
    for (const x of [-maxR - 0.18, maxR + 0.18]) {
        const capPts = [
            new THREE.Vector3(x, wy - 0.08, 0),
            new THREE.Vector3(x, wy + 0.08, 0)
        ];
        const cap = new THREE.Line(new THREE.BufferGeometry().setFromPoints(capPts), mat);
        cap.renderOrder = 999;
        group.add(cap);
    }
}
