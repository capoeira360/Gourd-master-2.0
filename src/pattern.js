import * as THREE from 'three';
import { getGourdRadius, getGourdHeight } from './gourd.js';
import { state } from './state.js';

// Calculates a 3D coordinate directly wrapped on the gourd's surface with an offset
export function getSurfacePoint(t, angle, offset = 0.006, rOffset = 0) {
    const H_three = getGourdHeight();
    const r = getGourdRadius(t) + offset + rOffset;
    let y = t * H_three - H_three / 2;
    
    let x = r * Math.cos(angle);
    let z = r * Math.sin(angle);
    
    // Apply lateral shifts for uneven/bent shape
    const bendX = state.gourdBendX || 0;
    const bendZ = state.gourdBendZ || 0;
    if (bendX !== 0 || bendZ !== 0) {
        const factor = Math.pow(t, 2);
        const scaleFactor = 0.1;
        x += bendX * scaleFactor * factor;
        z += bendZ * scaleFactor * factor;
    }
    
    return new THREE.Vector3(x, y, z);
}

// Calculates the surface normal vector at height t and angle theta
export function getSurfaceNormal(t, theta) {
    const H_three = getGourdHeight();
    const dt = 0.01;
    const r1 = getGourdRadius(Math.max(0, t - dt));
    const r2 = getGourdRadius(Math.min(1, t + dt));
    const dr = (r2 - r1) / (2 * dt);

    // Normal components in local lathe coordinate space
    const ny = -dr / H_three;
    const nx = Math.cos(theta);
    const nz = Math.sin(theta);

    const normal = new THREE.Vector3(nx, ny, nz);
    return normal.normalize();
}

// Checks if a point on the surface (height t, angle theta) lies inside a pattern zone boundary (ignores exclusion/inversion masks)
export function isPointInZoneRaw(t, theta, zone) {
    if (!zone) return true;
    if (zone.type === 'full') return true;

    if (zone.type === 'hor-band') {
        return t >= zone.tMin && t <= zone.tMax;
    }

    if (zone.type === 'ver-strip') {
        let min = zone.thetaMin;
        let max = zone.thetaMax;
        if (min > max) {
            const tmp = min;
            min = max;
            max = tmp;
        }
        
        let val = theta;
        while (val < min) val += Math.PI * 2;
        while (val > min + Math.PI * 2) val -= Math.PI * 2;
        
        return val >= min && val <= max;
    }

    // Apply repeated sector mapping for all localized patches/shapes
    const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;
    let mappedTheta = theta;
    if (patchCount > 1) {
        const sector = (2 * Math.PI) / patchCount;
        let dTheta = theta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        dTheta = ((dTheta + sector / 2) % sector + sector) % sector - sector / 2;
        mappedTheta = zone.centerTheta + dTheta;
    }

    if (zone.type === 'custom-image') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;

        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const radius = Math.max(0.005, zone.radius || 0.15);
        const u = rx / radius;
        const v = ry / radius;

        if (Math.abs(u) > 1.0 || Math.abs(v) > 1.0) {
            return false;
        }

        const px = Math.floor((u + 1.0) / 2.0 * 128);
        const py = Math.floor((v + 1.0) / 2.0 * 128);
        const invertedPy = 127 - py;

        if (zone.customImageDataUrl) {
            if (!window.appImageCache) window.appImageCache = {};
            const cached = window.appImageCache[zone.customImageDataUrl];
            if (cached && cached.status === 'loaded' && cached.alphaGrid) {
                const alphaGrid = cached.alphaGrid;
                const idx = (invertedPy * 128 + px) * 4;
                const red = alphaGrid[idx];
                const green = alphaGrid[idx + 1];
                const blue = alphaGrid[idx + 2];
                const alpha = alphaGrid[idx + 3];

                if (alpha < 50) return false;
                const brightness = (red + green + blue) / 3;
                return brightness < 200;
            } else if (!cached) {
                // Trigger loading
                window.appImageCache[zone.customImageDataUrl] = { status: 'loading' };
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 128;
                    canvas.height = 128;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, 128, 128);
                    const alphaGrid = ctx.getImageData(0, 0, 128, 128).data;
                    window.appImageCache[zone.customImageDataUrl] = {
                        status: 'loaded',
                        img: img,
                        alphaGrid: alphaGrid
                    };
                    if (window.refreshPatternGroup) {
                        window.refreshPatternGroup();
                    }
                };
                img.src = zone.customImageDataUrl;
            }
        } else {
            // Draw a fallback cross shape so they see something is active
            return Math.abs(u) <= 0.15 || Math.abs(v) <= 0.15;
        }
        return false;
    }

    if (zone.type === 'circular-patch') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= zone.radius;
    }

    if (zone.type === 'square-patch' || zone.type === 'square') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;
        
        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const halfSide = zone.radius || 0.15;
        
        if (zone.type === 'square-patch') {
            return Math.abs(rx) <= halfSide && Math.abs(ry) <= halfSide;
        } else {
            const inOuter = Math.abs(rx) <= halfSide && Math.abs(ry) <= halfSide;
            if (zone.fillType === 'concentric') {
                return inOuter;
            } else {
                const thickness = 0.015;
                const inInner = Math.abs(rx) <= (halfSide - thickness) && Math.abs(ry) <= (halfSide - thickness);
                return inOuter && !inInner;
            }
        }
    }

    if (zone.type === 'diagonal-stripe') {
        const y = t * getGourdHeight() - getGourdHeight() / 2;
        const r = getGourdRadius(t);
        const x = r * theta;
        const slantRad = (zone.slantAngle || 0) * Math.PI / 180;

        const proj = y * Math.cos(slantRad) - x * Math.sin(slantRad);
        const centerProj = (zone.centerT * getGourdHeight() - getGourdHeight() / 2) * Math.cos(slantRad);
        return Math.abs(proj - centerProj) <= (zone.width || 0.15);
    }

    const localShapes = ['circle', 'fish', 'star', 'flower', 'heart', 'triangle'];
    if (localShapes.includes(zone.type)) {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;

        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const radius = Math.max(0.005, zone.radius || 0.15);
        const u = rx / radius;
        const v = ry / radius;

        if (zone.type === 'circle') {
            const inOuter = (u * u + v * v) <= 1.0;
            if (zone.fillType === 'concentric') {
                return inOuter;
            } else {
                const thickness = 0.015;
                const inInner = (u * u + v * v) <= ((1.0 - thickness) * (1.0 - thickness));
                return inOuter && !inInner;
            }
        }
        if (zone.type === 'fish') {
            const inBody = (((u + 0.15) * (u + 0.15)) / 0.36 + (v * v) / 0.08) <= 1.0;
            const inTail = (u >= 0.2 && u <= 0.7 && Math.abs(v) <= 0.5 * (u - 0.15));
            const inEye = (((u + 0.3) * (u + 0.3)) + ((v - 0.04) * (v - 0.04))) <= 0.0016;
            return (inBody || inTail) && !inEye;
        }
        if (zone.type === 'star') {
            const rStar = Math.sqrt(u * u + v * v);
            const aStar = Math.atan2(v, u);
            const starBound = 0.6 + 0.4 * Math.cos(5 * aStar - Math.PI / 2) * 0.4;
            return rStar <= starBound;
        }
        if (zone.type === 'flower') {
            const rFl = Math.sqrt(u * u + v * v);
            const aFl = Math.atan2(v, u);
            const flBound = 0.7 + 0.3 * Math.cos(6 * aFl);
            return rFl <= flBound;
        }
        if (zone.type === 'heart') {
            const x = u * 1.2;
            const y = (v + 0.2) * 1.2;
            return (x*x + y*y - 0.4)*(x*x + y*y - 0.4)*(x*x + y*y - 0.4) - x*x*y*y*y <= 0;
        }
        if (zone.type === 'triangle') {
            return v >= -0.5 && v <= 1.0 - 1.5 * Math.abs(u);
        }
    }

    return false;
}

// Checks if a point on the surface (height t, angle theta) lies inside a pattern zone (handles exclusion masks & cross-layer masking)
export function isPointInZone(t, theta, zone) {
    if (!zone) return true;

    // 1. Evaluate this zone's own clipping bounds
    const inThisZone = isPointInZoneRaw(t, theta, zone);
    if (!inThisZone) return false;

    // 2. Check cross-layer clipping (exclude background under this point if other layers request it)
    const zones = (state && state.patternZones) ? state.patternZones : [];
    const idx = zones.indexOf(zone);

    for (const otherZone of zones) {
        if (otherZone.id === zone.id) continue;
        if (otherZone.style === 'off' || otherZone.visible === false) continue;
        if (otherZone.clipBackground === false) continue;

        const otherIdx = zones.indexOf(otherZone);
        if (otherIdx > idx) continue; // Only clip by layers above this one in the stack

        if (otherZone.type !== 'full') {
            // If the point is inside the other shape, clip it out!
            if (isPointInZoneRaw(t, theta, otherZone)) {
                return false;
            }
        }
    }

    return true;
}

// Clips a continuous coordinate path into multiple segments that lie within a zone
export function clipPathToZone(path, zone) {
    const subPaths = [];
    let currentSubPath = [];

    for (const pt of path) {
        if (isPointInZone(pt.t, pt.theta, zone)) {
            currentSubPath.push(pt);
        } else {
            if (currentSubPath.length >= 2) {
                subPaths.push(currentSubPath);
            }
            currentSubPath = [];
        }
    }
    if (currentSubPath.length >= 2) {
        subPaths.push(currentSubPath);
    }
    return subPaths;
}

// Samples a cylindrical path array uniformly along 3D space arc lengths
export function samplePathUniformly(path, stepSize) {
    const points = [];
    if (path.length === 0) return points;

    const pts3d = path.map(p => getSurfacePoint(p.t, p.theta, 0, p.rOffset || 0));

    let accumulatedDistance = 0;
    points.push(path[0]);

    let lastSampleDist = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const pA = path[i];
        const pB = path[i + 1];

        const ptA = pts3d[i];
        const ptB = pts3d[i + 1];

        const segmentLength = ptA.distanceTo(ptB);

        while (lastSampleDist + stepSize <= accumulatedDistance + segmentLength) {
            const neededDist = (lastSampleDist + stepSize) - accumulatedDistance;
            const alpha = neededDist / Math.max(0.0001, segmentLength);

            const t = pA.t + alpha * (pB.t - pA.t);

            let thetaA = pA.theta;
            let thetaB = pB.theta;
            if (Math.abs(thetaB - thetaA) > Math.PI) {
                if (thetaB > thetaA) thetaA += Math.PI * 2;
                else thetaB += Math.PI * 2;
            }
            let theta = thetaA + alpha * (thetaB - thetaA);
            theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

            const rOffset = (pA.rOffset || 0) + alpha * ((pB.rOffset || 0) - (pA.rOffset || 0));

            points.push({ t, theta, rOffset });
            lastSampleDist += stepSize;
        }

        accumulatedDistance += segmentLength;
    }

    return points;
}

// Generates primary/horizontal paths (rings, CW spirals) with tilt shear
export function generateHorizontalPaths(type, density, tiltAngleDeg = 0) {
    const paths = [];
    const tanGamma = Math.tan(tiltAngleDeg * Math.PI / 180);

    if (type === 'grid') {
        const ringCount = Math.round(density * 14);
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            const segs = 64;
            for (let j = 0; j <= segs; j++) {
                const a = (j / segs) * Math.PI * 2;
                const tTilt = tBase + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
    } else if (type === 'diamond') {
        const wraps = 3 * density;
        const lineCount = Math.round(density * 10);
        for (let i = 0; i < lineCount; i++) {
            const startAngle = (i / lineCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 100; j++) {
                const t = 0.03 + (j / 100) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const a = startAngle + t * Math.PI * wraps;
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                path.push({ t, theta: a + twist, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'spiral') {
        const spirals = Math.round(density * 6);
        const wraps = 5 * density;
        for (let i = 0; i < spirals; i++) {
            const startAngle = (i / spirals) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 120; j++) {
                const t = 0.02 + (j / 120) * 0.96;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const a = startAngle + t * Math.PI * wraps;
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                path.push({ t, theta: a + twist, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    }

    // Include the horizontal zigzag wave if zigzag type selected
    if (type === 'zigzag') {
        const pathsZig = [];
        const ringCount = Math.round(density * 12);
        const teeth = Math.round(density * 24);
        const amp = 0.02 * density;
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            for (let j = 0; j <= teeth * 2; j++) {
                const a = (j / (teeth * 2)) * Math.PI * 2;
                const zigOffset = ((j % 2 === 0) ? amp : -amp);
                const tTilt = tBase + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: zigOffset });
            }
            path.push({ ...path[0] });
            pathsZig.push(path);
        }
        return pathsZig;
    }

    return paths;
}

// Generates secondary/vertical paths (meridians, CCW spirals) with tilt shear
export function generateVerticalPaths(type, density, tiltAngleDeg = 0, leanAngle = 0) {
    const paths = [];
    const tanGamma = Math.tan(tiltAngleDeg * Math.PI / 180);
    const leanTan = Math.tan(leanAngle * Math.PI / 180);

    if (type === 'grid' || type === 'spiral') {
        const merCount = Math.round(density * 10);
        for (let i = 0; i < merCount; i++) {
            const baseAngle = (i / merCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 80; j++) {
                const t = 0.03 + (j / 80) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: baseAngle + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'diamond') {
        const wraps = 3 * density;
        const lineCount = Math.round(density * 10);
        for (let i = 0; i < lineCount; i++) {
            const startAngle = (i / lineCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 100; j++) {
                const t = 0.03 + (j / 100) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const a = startAngle - t * Math.PI * wraps;
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: a + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'zigzag') {
        const vCount = Math.round(density * 6);
        for (let i = 0; i < vCount; i++) {
            const a = (i / vCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 80; j++) {
                const t = 0.03 + (j / 80) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: a + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    }

    return paths;
}

// Internal helper to render a single custom layer in the pattern group
function renderPatternLayer(group, paths, style, colorHex, opacity, holeSize, distMode, holeCount, holeDistance, dashSpacing = 0, zone = null) {
    if (paths.length === 0) return 0;

    const idx = (zone && state && state.patternZones) ? state.patternZones.indexOf(zone) : -1;
    const baseRenderOrder = 900;
    const renderOrderVal = idx !== -1 ? baseRenderOrder + (state.patternZones.length - idx) : 900;

    if (style === 'lines') {
        const color = new THREE.Color(colorHex);
        const mat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        mat.userData = { originalOpacity: opacity };

        let lineSegmentCount = 0;
        for (const path of paths) {
            if (path.length < 2) continue;
            
            if (dashSpacing > 0.02) {
                const pts3d = path.map(pt => getSurfacePoint(pt.t, pt.theta, 0.005, pt.rOffset || 0));
                
                let currentLen = 0;
                let activeSegment = [pts3d[0]];
                
                for (let i = 0; i < path.length - 1; i++) {
                    const ptA = pts3d[i];
                    const ptB = pts3d[i+1];
                    const d = ptA.distanceTo(ptB);
                    currentLen += d;
                    
                    const cycle = currentLen % dashSpacing;
                    const isDraw = cycle < (dashSpacing * 0.5);
                    
                    if (isDraw) {
                        activeSegment.push(ptB);
                    } else {
                        if (activeSegment.length >= 2) {
                            const geom = new THREE.BufferGeometry().setFromPoints(activeSegment);
                            const line = new THREE.Line(geom, mat);
                            line.renderOrder = renderOrderVal;
                            group.add(line);
                            lineSegmentCount++;
                        }
                        activeSegment = [ptB];
                    }
                }
                if (activeSegment.length >= 2) {
                    const geom = new THREE.BufferGeometry().setFromPoints(activeSegment);
                    const line = new THREE.Line(geom, mat);
                    line.renderOrder = renderOrderVal;
                    group.add(line);
                    lineSegmentCount++;
                }
            } else {
                const pts = path.map(pt => getSurfacePoint(pt.t, pt.theta, 0.005, pt.rOffset || 0));
                const geom = new THREE.BufferGeometry().setFromPoints(pts);
                const line = new THREE.Line(geom, mat);
                line.renderOrder = renderOrderVal;
                group.add(line);
                lineSegmentCount++;
            }
        }

        return lineSegmentCount;
    } else {
        // Drilled holes
        const holePoints = [];

        if (distMode === 'distance') {
            const stepSize = holeDistance;
            for (const path of paths) {
                const sampled = samplePathUniformly(path, stepSize);
                for (const pt of sampled) {
                    if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                    holePoints.push(pt);
                }
            }
        } else {
            // Count-based (Hole Count per path)
            for (const path of paths) {
                const count = Math.max(1, Math.round(holeCount));
                if (count === 1) {
                    const mid = Math.floor(path.length / 2);
                    const pt = path[mid];
                    if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                    holePoints.push(pt);
                } else {
                    const pts3d = path.map(p => getSurfacePoint(p.t, p.theta, 0, p.rOffset || 0));
                    let totalLength = 0;
                    const lengths = [];
                    for (let i = 0; i < path.length - 1; i++) {
                        const len = pts3d[i].distanceTo(pts3d[i + 1]);
                        totalLength += len;
                        lengths.push(totalLength);
                    }

                    const firstPt = path[0];
                    if (!zone || isPointInZone(firstPt.t, firstPt.theta, zone)) {
                        holePoints.push(firstPt);
                    }

                    for (let k = 1; k < count; k++) {
                        const targetDist = (k / (count - 1)) * totalLength;
                        let segIdx = 0;
                        while (segIdx < lengths.length && lengths[segIdx] < targetDist) {
                            segIdx++;
                        }

                        const prevDist = segIdx === 0 ? 0 : lengths[segIdx - 1];
                        const nextDist = lengths[segIdx];
                        const segLength = nextDist - prevDist;
                        const alpha = segLength > 0.0001 ? (targetDist - prevDist) / segLength : 0;

                        const pA = path[segIdx];
                        const pB = path[segIdx + 1];
                        if (!pB) continue;

                        const t = pA.t + alpha * (pB.t - pA.t);

                        let thetaA = pA.theta;
                        let thetaB = pB.theta;
                        if (Math.abs(thetaB - thetaA) > Math.PI) {
                            if (thetaB > thetaA) thetaA += Math.PI * 2;
                            else thetaB += Math.PI * 2;
                        }
                        let theta = thetaA + alpha * (thetaB - thetaA);
                        theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                        const rOffset = (pA.rOffset || 0) + alpha * ((pB.rOffset || 0) - (pA.rOffset || 0));

                        const pt = { t, theta, rOffset };
                        if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                        holePoints.push(pt);
                    }
                }
            }
        }

        if (holePoints.length === 0) return 0;

        let circleGeom;
        if (zone && zone.holeShape === 'wobbly') {
            const shape = new THREE.Shape();
            const segments = 32;
            const amp = zone.holeWobbleAmp !== undefined ? zone.holeWobbleAmp : 0.15;
            const freq = zone.holeWobbleFreq !== undefined ? zone.holeWobbleFreq : 5;
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * Math.PI * 2;
                const r = holeSize * (1.0 + amp * Math.cos(freq * phi));
                const x = r * Math.cos(phi);
                const y = r * Math.sin(phi);
                if (i === 0) {
                    shape.moveTo(x, y);
                } else {
                    shape.lineTo(x, y);
                }
            }
            shape.closePath();
            circleGeom = new THREE.ShapeGeometry(shape);
        } else {
            circleGeom = new THREE.CircleGeometry(holeSize, 14);
        }
        const circleMat = new THREE.MeshBasicMaterial({
            color: 0x090706,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        circleMat.userData = { originalOpacity: opacity };

        const instancedMesh = new THREE.InstancedMesh(circleGeom, circleMat, holePoints.length);
        instancedMesh.renderOrder = renderOrderVal;

        let idx = 0;
        const upVector = new THREE.Vector3(0, 0, 1);

        for (const pt of holePoints) {
            const pos = getSurfacePoint(pt.t, pt.theta, 0.002, pt.rOffset || 0);
            const norm = getSurfaceNormal(pt.t, pt.theta);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(upVector, norm);

            const scale = new THREE.Vector3(1, 1, 1);
            const matrix = new THREE.Matrix4();
            matrix.compose(pos, quaternion, scale);

            instancedMesh.setMatrixAt(idx++, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);

        return holePoints.length;
    }
}

// Generates nested concentric outlines scaling inwards for local shape masks
function generateConcentricLoops(zone) {
    const localShapes = ['circle', 'square', 'circular-patch', 'square-patch', 'fish', 'star', 'flower', 'heart', 'triangle'];
    if (!localShapes.includes(zone.type)) return [];

    const N = 100;
    const basePts = [];

    if (zone.type === 'circle' || zone.type === 'circular-patch') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            basePts.push({ u: Math.cos(psi), v: Math.sin(psi) });
        }
    } else if (zone.type === 'square' || zone.type === 'square-patch') {
        const sqVerts = [
            { u: -1.0, v: 1.0 },
            { u: 1.0, v: 1.0 },
            { u: 1.0, v: -1.0 },
            { u: -1.0, v: -1.0 },
            { u: -1.0, v: 1.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 4 * alpha;
            const idx = Math.min(3, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = sqVerts[idx];
            const pB = sqVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'star') {
        const starVerts = [];
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5 - Math.PI / 2;
            const r = (i % 2 === 0) ? 1.0 : 0.4;
            starVerts.push({ u: r * Math.cos(angle), v: r * Math.sin(angle) });
        }
        starVerts.push(starVerts[0]);
        
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 10 * alpha;
            const idx = Math.min(9, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = starVerts[idx];
            const pB = starVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'triangle') {
        const triVerts = [
            { u: 0, v: 1.0 },
            { u: -0.866, v: -0.5 },
            { u: 0.866, v: -0.5 },
            { u: 0, v: 1.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 3 * alpha;
            const idx = Math.min(2, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = triVerts[idx];
            const pB = triVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'heart') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            const u = 0.85 * Math.pow(Math.sin(psi), 3);
            const v = 0.05 + 0.06 * (13 * Math.cos(psi) - 5 * Math.cos(2*psi) - 2 * Math.cos(3*psi) - Math.cos(4*psi));
            basePts.push({ u, v });
        }
    } else if (zone.type === 'flower') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            const r = 0.7 + 0.3 * Math.cos(6 * psi);
            basePts.push({ u: r * Math.cos(psi), v: r * Math.sin(psi) });
        }
    } else if (zone.type === 'fish') {
        const fishVerts = [
            { u: -0.7, v: 0.0 },
            { u: -0.5, v: 0.12 },
            { u: -0.2, v: 0.22 },
            { u: 0.1,  v: 0.18 },
            { u: 0.35, v: 0.08 },
            { u: 0.7,  v: 0.45 },
            { u: 0.6,  v: 0.0 },
            { u: 0.7,  v: -0.45 },
            { u: 0.35, v: -0.08 },
            { u: 0.1,  v: -0.18 },
            { u: -0.2, v: -0.22 },
            { u: -0.5, v: -0.12 },
            { u: -0.7, v: 0.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 12 * alpha;
            const idx = Math.min(11, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = fishVerts[idx];
            const pB = fishVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    }

    const spacing = 1.0 / zone.density;
    const R = Math.max(0.005, zone.radius || 0.15);

    const loops = [];
    let currentRadius = R;

    while (currentRadius > 0.002) {
        const scale = currentRadius / R;
        const loopPath = [];

        for (const pt of basePts) {
            const rx = pt.u * R * scale;
            const ry = pt.v * R * scale;

            const phi = -(zone.shapeRotation || 0) * Math.PI / 180;
            const dx = rx * Math.cos(phi) - ry * Math.sin(phi);
            const dy = rx * Math.sin(phi) + ry * Math.cos(phi);

            const t = zone.centerT + dy / getGourdHeight();
            const r = getGourdRadius(t);
            const theta = zone.centerTheta + dx / r;

            loopPath.push({ t, theta });
        }

        loops.push(loopPath);
        currentRadius -= spacing;
    }

    return loops;
}

// Parses SVG text, samples path points, and conformally projects coordinates onto the 3D gourd surface
export function getSvgPaths(zone) {
    if (!zone || !zone.customSvgText) return [];
    
    const paths = [];
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(zone.customSvgText, "image/svg+xml");
        const svgEl = xmlDoc.documentElement;
        if (!svgEl) return [];

        let w = 100, h = 100;
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(/\s+/).filter(Boolean);
            if (parts.length === 4) {
                w = parseFloat(parts[2]);
                h = parseFloat(parts[3]);
            }
        } else {
            const widthAttr = svgEl.getAttribute('width');
            const heightAttr = svgEl.getAttribute('height');
            if (widthAttr) w = parseFloat(widthAttr);
            if (heightAttr) h = parseFloat(heightAttr);
        }

        const hiddenContainer = document.createElement('div');
        hiddenContainer.style.position = 'absolute';
        hiddenContainer.style.width = '0px';
        hiddenContainer.style.height = '0px';
        hiddenContainer.style.overflow = 'hidden';
        hiddenContainer.style.visibility = 'hidden';
        hiddenContainer.innerHTML = zone.customSvgText;
        document.body.appendChild(hiddenContainer);

        const svgDomEl = hiddenContainer.querySelector('svg');
        if (svgDomEl) {
            const pathEls = svgDomEl.querySelectorAll('path');
            
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.max(0.005, zone.radius || 0.15);
            const shapeRotRad = (zone.shapeRotation || 0) * Math.PI / 180;
            
            // Fixed sample resolution step (0.02 cm) to keep curves clean
            const stepSize = 0.02;
            const svgToCm = radius / (w / 2);
            const stepSizeInSvgPixels = stepSize / Math.max(0.0001, svgToCm);

            const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;

            for (const pathEl of pathEls) {
                const len = pathEl.getTotalLength();
                if (len <= 0) continue;

                const steps = Math.max(15, Math.round(len / stepSizeInSvgPixels));
                
                for (let p = 0; p < patchCount; p++) {
                    const offsetTheta = (p / patchCount) * Math.PI * 2;
                    let currentTheta = zone.centerTheta + offsetTheta;
                    currentTheta = ((currentTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                    const segment = [];
                    for (let i = 0; i <= steps; i++) {
                        const dist = (i / steps) * len;
                        const svgPt = pathEl.getPointAtLength(dist);
                        
                        const u = (svgPt.x - cx) / (w / 2);
                        const v = -(svgPt.y - cy) / (h / 2); // Invert Y axis

                        const rx = u * radius;
                        const ry = v * radius;

                        const dx = rx * Math.cos(shapeRotRad) - ry * Math.sin(shapeRotRad);
                        const dy = rx * Math.sin(shapeRotRad) + ry * Math.cos(shapeRotRad);

                        const dt = dy / getGourdHeight();
                        const t = zone.centerT + dt;
                        if (t < 0.01 || t > 0.99) continue;

                        const rGourd = getGourdRadius(t);
                        const dTheta = dx / rGourd;
                        let thetaPt = currentTheta + dTheta;
                        thetaPt = ((thetaPt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                        segment.push({ t, theta: thetaPt, rOffset: 0 });
                    }
                    if (segment.length >= 2) {
                        paths.push(segment);
                    }
                }
            }
        }
        document.body.removeChild(hiddenContainer);
    } catch (err) {
        console.error("Error parsing SVG vector paths", err);
    }
    return paths;
}

// Rebuilds pattern inside a parent THREE.Group (handles lines and instanced holes)
export function updatePatternGroup(group, state) {
    // Clear old children
    while (group.children.length > 0) {
        const child = group.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        group.remove(child);
    }

    // Apply rotation around central Y axis
    group.rotation.y = state.patRotation * Math.PI / 180;

    group.visible = state.patternVisible;
    if (!state.patternVisible || !state.patternZones || state.patternZones.length === 0) {
        state.patternCount = 0;
        state.patternCountType = 'Lines';
        return 0;
    }

    let totalCount = 0;
    let hasHoles = false;
    let hasLines = false;

    // Render each pattern zone individually
    for (const zone of state.patternZones) {
        if (zone.style === 'off' || zone.visible === false) continue;

        if (zone.type === 'custom-image' && zone.customSvgText) {
            const svgPaths = getSvgPaths(zone);
            if (zone.style === 'lines') {
                hasLines = true;
                const count = renderPatternLayer(
                    group, svgPaths, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            } else if (zone.style === 'holes') {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, svgPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            continue;
        }

        if (zone.fillType === 'concentric' && ['circle', 'square', 'circular-patch', 'square-patch', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
            const concentricLoops = generateConcentricLoops(zone);
            const validLoops = concentricLoops.map(loop => {
                return loop.filter(pt => pt.t >= 0 && pt.t <= 1);
            }).filter(loop => loop.length >= 2);

            if (zone.style === 'lines') {
                hasLines = true;
                const count = renderPatternLayer(
                    group, validLoops, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            } else if (zone.style === 'holes') {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, validLoops, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            continue;
        }

        const direction = zone.direction || 'both';

        const patLayout = zone.patternType || 'grid';
        const horPaths = generateHorizontalPaths(patLayout, zone.density, state.patTilt);
        const verPaths = generateVerticalPaths(patLayout, zone.density, state.patTilt, zone.leanAngle || 0);

        if (zone.style === 'lines') {
            hasLines = true;
            
            if (direction === 'both' || direction === 'horizontal') {
                const clippedHor = [];
                for (const path of horPaths) {
                    clippedHor.push(...clipPathToZone(path, zone));
                }
                const countHor = renderPatternLayer(
                    group, clippedHor, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countHor;
            }

            if (direction === 'both' || direction === 'vertical') {
                const clippedVer = [];
                for (const path of verPaths) {
                    clippedVer.push(...clipPathToZone(path, zone));
                }
                const countVer = renderPatternLayer(
                    group, clippedVer, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countVer;
            }
        } else if (zone.style === 'holes') {
            hasHoles = true;

            if (direction === 'both' || direction === 'horizontal') {
                const countHor = renderPatternLayer(
                    group, horPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countHor;
            }

            if (direction === 'both' || direction === 'vertical') {
                const countVer = renderPatternLayer(
                    group, verPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countVer;
            }
        }
    }

    state.patternCount = totalCount;
    if (hasHoles && hasLines) {
        state.patternCountType = 'Items';
    } else if (hasHoles) {
        state.patternCountType = 'Holes';
    } else {
        state.patternCountType = 'Lines';
    }

    return totalCount;
}

// Applies a subtle glow pulse to pattern elements in the animation loop
export function animatePatternPulse(group, opacity, elapsed) {
    if (!group.visible || group.children.length === 0) return;
    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 1.5);
    group.children.forEach(child => {
        if (child.material) {
            const orig = (child.material.userData && child.material.userData.originalOpacity !== undefined)
                ? child.material.userData.originalOpacity
                : 1.0;
            child.material.opacity = orig * pulse;
        }
    });
}

window.appPatternHelpers = {
    generateHorizontalPaths,
    generateVerticalPaths,
    generateConcentricLoops,
    clipPathToZone
};
