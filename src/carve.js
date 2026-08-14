import * as THREE from 'three';
import { getSurfacePoint, getSurfaceNormal } from './pattern.js';
import { getGourdHeight, getGourdRadius } from './gourd.js';

// ----------------------------------------------------------------------------------
// Typography, Lettering & Conformal Gourd Surface Generator
// ----------------------------------------------------------------------------------

function normalizeAngle(theta) {
    while (theta > Math.PI) theta -= 2 * Math.PI;
    while (theta < -Math.PI) theta += 2 * Math.PI;
    return theta;
}

/**
 * Generates 3D carved typography objects for a text item using high-resolution
 * rasterization and a conformal curved surface mesh grid on the gourd.
 */
export function generateTextCarveObjects(item, state) {
    const rawText = (item.text !== undefined && item.text !== null) ? String(item.text) : 'KIBUYU';
    if (!rawText.trim()) return [];

    let processedText = rawText;
    if (item.textCase === 'uppercase') processedText = processedText.toUpperCase();
    if (item.textCase === 'lowercase') processedText = processedText.toLowerCase();

    const lines = processedText.split('\n');

    // 1. Offscreen High-Res Canvas for Text Rasterization
    const cWidth = 1400;
    const cHeight = 700;
    const canvas = document.createElement('canvas');
    canvas.width = cWidth;
    canvas.height = cHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];

    ctx.clearRect(0, 0, cWidth, cHeight);

    const baseFontSizePx = 90;
    const fontStyle = item.fontStyle === 'italic' ? 'italic ' : '';
    const fontWeight = item.fontWeight === 'bold' ? 'bold ' : (item.fontWeight || 'normal ');
    const fontFamily = item.fontFamily || 'Cinzel Decorative';

    ctx.font = `${fontStyle}${fontWeight}${baseFontSizePx}px "${fontFamily}", serif, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineSpacingPx = (item.lineHeight !== undefined ? item.lineHeight : 1.2) * baseFontSizePx;
    const totalLinesHeight = (lines.length - 1) * lineSpacingPx;
    const startY = (cHeight / 2) - (totalLinesHeight / 2);
    const trackingExtraPx = (item.letterSpacing !== undefined ? item.letterSpacing : 0.02) * 600;

    const carveStyle = item.carveStyle || 'solid'; // 'solid', 'outline', 'gold', 'hatch', 'dots'
    const carveColorHex = item.carveColor || '#3A1E08';
    const carveColor = new THREE.Color(carveColorHex);

    // Render text to canvas with proper font style & chosen color
    if (carveStyle === 'outline') {
        ctx.strokeStyle = carveColorHex;
        ctx.lineWidth = Math.max(3, (item.strokeWidth || 0.02) * 160);
        ctx.lineJoin = 'round';
    } else if (carveStyle === 'gold') {
        const grad = ctx.createLinearGradient(0, startY - 40, 0, startY + totalLinesHeight + 40);
        grad.addColorStop(0, '#FFF3B0');
        grad.addColorStop(0.3, '#D4AF37');
        grad.addColorStop(0.7, '#996515');
        grad.addColorStop(1, '#FFE082');
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = carveColorHex;
    }

    lines.forEach((line, lineIdx) => {
        const lineY = startY + lineIdx * lineSpacingPx;
        if (Math.abs(trackingExtraPx) < 0.5) {
            if (carveStyle === 'outline') {
                ctx.strokeText(line, cWidth / 2, lineY);
            } else {
                ctx.fillText(line, cWidth / 2, lineY);
            }
        } else {
            const chars = line.split('');
            const charWidths = chars.map(ch => ctx.measureText(ch).width);
            const totalWidth = charWidths.reduce((a, b) => a + b, 0) + (chars.length - 1) * trackingExtraPx;
            let curX = (cWidth / 2) - (totalWidth / 2);

            chars.forEach((ch, ci) => {
                const cw = charWidths[ci];
                if (carveStyle === 'outline') {
                    ctx.strokeText(ch, curX + cw / 2, lineY);
                } else {
                    ctx.fillText(ch, curX + cw / 2, lineY);
                }
                curX += cw + trackingExtraPx;
            });
        }
    });

    // If Hatch style, overlay hatch pattern
    if (carveStyle === 'hatch') {
        const hatchAngleDeg = item.hatchAngle !== undefined ? item.hatchAngle : 45;
        const hatchRad = hatchAngleDeg * (Math.PI / 180);
        const density = item.hatchDensity !== undefined ? item.hatchDensity : 15;
        const hatchStep = Math.max(4, Math.floor(180 / Math.max(1, density)));
        
        ctx.globalCompositeOperation = 'source-in';
        ctx.strokeStyle = carveColorHex;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const diag = Math.sqrt(cWidth * cWidth + cHeight * cHeight);
        const cosH = Math.cos(hatchRad);
        const sinH = Math.sin(hatchRad);
        for (let d = -diag; d <= diag; d += hatchStep) {
            const x1 = cWidth / 2 + d * cosH - diag * sinH;
            const y1 = cHeight / 2 + d * sinH + diag * cosH;
            const x2 = cWidth / 2 + d * cosH + diag * sinH;
            const y2 = cHeight / 2 + d * sinH - diag * cosH;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }

    // Measure text bounding box
    const imgData = ctx.getImageData(0, 0, cWidth, cHeight);
    const data = imgData.data;
    let minX = cWidth, maxX = 0, minY = cHeight, maxY = 0;
    let hasPixels = false;
    for (let y = 0; y < cHeight; y++) {
        for (let x = 0; x < cWidth; x++) {
            const a = data[(y * cWidth + x) * 4 + 3];
            if (a > 25) {
                hasPixels = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (!hasPixels || maxX <= minX || maxY <= minY) return [];

    const pad = 24;
    minX = Math.max(0, minX - pad);
    maxX = Math.min(cWidth - 1, maxX + pad);
    minY = Math.max(0, minY - pad);
    maxY = Math.min(cHeight - 1, maxY + pad);

    const cropW = maxX - minX;
    const cropH = maxY - minY;

    // Crop to tight canvas for optimal texture mapping
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    // Conformal mapping to Gourd 3D Surface
    const centerT = item.centerT !== undefined ? item.centerT : 0.5;
    // Default centerTheta = 90 deg (Math.PI / 2) so it faces camera directly on front
    const centerTheta = item.centerTheta !== undefined ? item.centerTheta : (Math.PI / 2);
    const userRotation = (item.rotation !== undefined ? item.rotation : 0.0) * (Math.PI / 180);
    const fontSizeScale = item.fontSize !== undefined ? item.fontSize : 0.08;
    const aspectWidth = item.aspectWidth !== undefined ? item.aspectWidth : 1.0;
    const archAngle = (item.archAngle !== undefined ? item.archAngle : 0.0) * (Math.PI / 180);
    const slantAngle = (item.slantAngle !== undefined ? item.slantAngle : 0.0) * (Math.PI / 180);
    const taper = item.taper !== undefined ? item.taper : 0.0;
    const wrapMode = item.wrapMode || 'horizontal';
    const carveDepth = (item.carveDepth !== undefined ? item.carveDepth : 0.004) + 0.006;

    const H_three = getGourdHeight();
    const r_local = getGourdRadius(centerT);

    // Metric dimensions: font height in Three.js units (preserves exact natural aspect ratio!)
    const fontHeightUnits = fontSizeScale * 2.2;
    const pxToUnits = fontHeightUnits / Math.max(1, cropH);
    const fontWidthUnits = cropW * pxToUnits * aspectWidth;

    const renderObjects = [];

    if (carveStyle === 'dots') {
        // Drilled Stipple Holes
        const dotSpacingPx = Math.max(12, (item.dotSpacing !== undefined ? item.dotSpacing : 0.02) * 600);
        const dotRadius = Math.max(0.003, (item.dotSize !== undefined ? item.dotSize : 0.006));
        const dotGeom = new THREE.CircleGeometry(dotRadius, 14);
        const dotMat = new THREE.MeshBasicMaterial({
            color: carveColor,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4
        });

        for (let y = minY; y <= maxY; y += dotSpacingPx) {
            for (let x = minX; x <= maxX; x += dotSpacingPx) {
                const ix = Math.floor(x);
                const iy = Math.floor(y);
                const alpha = data[(iy * cWidth + ix) * 4 + 3];
                if (alpha > 120) {
                    let u = (x - (minX + maxX) / 2) * pxToUnits * aspectWidth;
                    let v = -(y - (minY + maxY) / 2) * pxToUnits;

                    // Apply Slant
                    if (Math.abs(slantAngle) > 0.001) {
                        u += v * Math.tan(slantAngle);
                    }

                    // Apply Taper
                    if (Math.abs(taper) > 0.001) {
                        const taperScale = 1.0 + (v / fontHeightUnits) * taper;
                        u *= Math.max(0.2, taperScale);
                    }

                    // Apply Arch
                    if (Math.abs(archAngle) > 0.001) {
                        const bendRadius = (fontWidthUnits * 0.5) / Math.max(0.01, Math.abs(archAngle));
                        const bendSign = Math.sign(archAngle);
                        const thetaBend = (u / fontWidthUnits) * archAngle;
                        const rOffset = (bendRadius - Math.cos(thetaBend) * bendRadius) * bendSign;
                        v -= rOffset;
                        u = Math.sin(thetaBend) * bendRadius;
                    }

                    let rx = u, ry = v;
                    if (Math.abs(userRotation) > 0.001) {
                        rx = u * Math.cos(userRotation) - v * Math.sin(userRotation);
                        ry = u * Math.sin(userRotation) + v * Math.cos(userRotation);
                    }

                    let tPt, thetaPt;
                    if (wrapMode === 'vertical') {
                        tPt = centerT - rx / H_three;
                        thetaPt = centerTheta - ry / r_local;
                    } else {
                        tPt = centerT + ry / H_three;
                        thetaPt = centerTheta - rx / r_local;
                    }
                    tPt = Math.max(0.005, Math.min(0.995, tPt));
                    thetaPt = normalizeAngle(thetaPt);

                    const pos = getSurfacePoint(tPt, thetaPt, carveDepth);
                    const norm = getSurfaceNormal(tPt, thetaPt);
                    const dotMesh = new THREE.Mesh(dotGeom, dotMat);
                    dotMesh.position.copy(pos);
                    dotMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
                    dotMesh.renderOrder = 998;
                    renderObjects.push(dotMesh);
                }
            }
        }
    } else {
        // Conformal Curved Surface Mesh Decal for Crisp, Anti-Aliased Lettering
        const uSegs = 48;
        const vSegs = 24;
        const geom = new THREE.PlaneGeometry(1, 1, uSegs, vSegs);
        const posAttr = geom.attributes.position;
        const uvAttr = geom.attributes.uv;

        for (let i = 0; i < posAttr.count; i++) {
            // UV coordinates [0, 1] relative to center [-0.5, 0.5]
            const uNorm = uvAttr.getX(i) - 0.5;
            const vNorm = uvAttr.getY(i) - 0.5;

            // World units offset
            let localU = uNorm * fontWidthUnits;
            let localV = vNorm * fontHeightUnits;

            // Apply Slant (Shear)
            if (Math.abs(slantAngle) > 0.001) {
                localU += localV * Math.tan(slantAngle);
            }

            // Apply Perspective Taper
            if (Math.abs(taper) > 0.001) {
                const taperScale = 1.0 + vNorm * taper;
                localU *= Math.max(0.2, taperScale);
            }

            // Apply Arch baseline bend
            if (Math.abs(archAngle) > 0.001) {
                const bendRadius = (fontWidthUnits * 0.5) / Math.max(0.01, Math.abs(archAngle));
                const bendSign = Math.sign(archAngle);
                const thetaBend = (localU / fontWidthUnits) * archAngle;
                const rOffset = (bendRadius - Math.cos(thetaBend) * bendRadius) * bendSign;
                localV -= rOffset;
                localU = Math.sin(thetaBend) * bendRadius;
            }

            // Apply user orientation rotation
            let rx = localU, ry = localV;
            if (Math.abs(userRotation) > 0.001) {
                rx = localU * Math.cos(userRotation) - localV * Math.sin(userRotation);
                ry = localU * Math.sin(userRotation) + localV * Math.cos(userRotation);
            }

            // Map to gourd surface: left-to-right reading correctly
            let tPt, thetaPt;
            if (wrapMode === 'vertical') {
                tPt = centerT - rx / H_three;
                thetaPt = centerTheta - ry / r_local;
            } else {
                tPt = centerT + ry / H_three;
                thetaPt = centerTheta - rx / r_local;
            }

            tPt = Math.max(0.005, Math.min(0.995, tPt));
            thetaPt = normalizeAngle(thetaPt);

            const surfacePt = getSurfacePoint(tPt, thetaPt, carveDepth);
            posAttr.setXYZ(i, surfacePt.x, surfacePt.y, surfacePt.z);
        }

        geom.computeVertexNormals();

        const texture = new THREE.CanvasTexture(cropCanvas);
        texture.anisotropy = 8;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        let mat;
        if (carveStyle === 'gold') {
            mat = new THREE.MeshStandardMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.06,
                roughness: 0.25,
                metalness: 0.85,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            });
        } else {
            mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.05,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            });
        }

        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 998;
        renderObjects.push(mesh);
    }

    return renderObjects;
}

// Rebuilds all text letterings in the THREE.Group
export function updateCarveGroup(group, state) {
    if (!group) return 0;

    while (group.children.length > 0) {
        const child = group.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            } else {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        }
        group.remove(child);
    }

    let totalCount = 0;

    // Render Text / Lettering Carvings
    if (state.carveTextItems && state.carveTextItems.length > 0) {
        state.carveTextItems.forEach(item => {
            if (item.visible !== false) {
                const objects = generateTextCarveObjects(item, state);
                objects.forEach(obj => group.add(obj));
                totalCount += objects.length;
            }
        });
    }

    return totalCount;
}
