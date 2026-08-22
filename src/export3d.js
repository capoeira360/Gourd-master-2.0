import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { state } from './state.js';
import { getGourdHeight } from './gourd.js';

/**
 * Kibuyu 3D Model Exporter Studio
 * Prepares and exports full-fidelity 3D assets to standard 3D formats:
 * - GLB / GLTF: Blender, Maya, Unreal Engine, Unity, Web 3D, Substance
 * - OBJ + MTL: Universal geometry format for all 3D CAD/DCC software
 * - STL: Direct 3D Printing & CNC Slicers (Cura, Prusa, Bambu, SolidWorks)
 * - USDZ: Native Apple AR QuickLook for iOS, iPadOS, macOS
 * - PLY: Polygon/Point scan data
 */

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename, mimeType = 'text/plain') {
    const blob = new Blob([text], { type: mimeType });
    downloadBlob(blob, filename);
}

/**
 * Builds a clean export scene containing the gourd, patterns, and carvings
 */
export function buildExportScene(gourdMesh, carveGroup, patternGroup, options = {}) {
    const {
        includeGourd = true,
        includePatterns = true,
        includeCarvings = true,
        scaleUnit = 'cm', // 'cm', 'mm', 'm'
        triangulateLines = false
    } = options;

    const exportRoot = new THREE.Group();
    exportRoot.name = (state.projectName || 'artisan-gourd').replace(/[^a-zA-Z0-9\-_]/g, '_');

    // Determine scale factor:
    // Three.js internal units: 3.0 units = 30 cm
    // - mm: 1 unit = 100mm (3.0 units -> 300 mm) => scale = 100
    // - cm: 1 unit = 10cm (3.0 units -> 30 cm) => scale = 10
    // - m:  1 unit = 0.1m (3.0 units -> 0.3 m) => scale = 0.1
    let scaleMultiplier = 10.0; // default cm
    if (scaleUnit === 'mm') scaleMultiplier = 100.0;
    else if (scaleUnit === 'm') scaleMultiplier = 0.1;
    else if (scaleUnit === 'raw') scaleMultiplier = 1.0;

    // 1. Gourd Body Mesh
    if (includeGourd && gourdMesh) {
        const bodyClone = gourdMesh.clone();
        bodyClone.name = 'Gourd_Body';
        // Ensure materials and maps are preserved
        if (gourdMesh.material) {
            bodyClone.material = gourdMesh.material.clone();
            if (gourdMesh.material.map) {
                bodyClone.material.map = gourdMesh.material.map;
            }
        }
        exportRoot.add(bodyClone);
    }

    // 2. 3D Carved Typography
    if (includeCarvings && carveGroup && carveGroup.children.length > 0) {
        const carveClone = carveGroup.clone(true);
        carveClone.name = 'Carved_Lettering';
        exportRoot.add(carveClone);
    }

    // 3. Decorative Patterns & Drill Holes
    if (includePatterns && patternGroup && patternGroup.children.length > 0) {
        const patternClone = new THREE.Group();
        patternClone.name = 'Surface_Patterns';

        patternGroup.children.forEach((child, idx) => {
            if (child.isLine || child.isLineSegments || child.isLineLoop) {
                if (triangulateLines && child.geometry) {
                    // Convert line to thin tube/ribbon mesh for formats like STL that only support triangles
                    try {
                        const pos = child.geometry.attributes.position;
                        if (pos && pos.count >= 2) {
                            const points = [];
                            for (let i = 0; i < pos.count; i++) {
                                points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
                            }
                            if (points.length >= 2) {
                                const curve = new THREE.CatmullRomCurve3(points);
                                const tubeGeom = new THREE.TubeGeometry(curve, Math.min(64, points.length * 2), 0.008, 4, false);
                                const tubeMat = new THREE.MeshStandardMaterial({
                                    color: child.material.color || 0xD4A843,
                                    roughness: 0.3,
                                    metalness: 0.6
                                });
                                const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
                                tubeMesh.name = `Pattern_Tube_${idx}`;
                                patternClone.add(tubeMesh);
                            }
                        }
                    } catch (e) {
                        patternClone.add(child.clone());
                    }
                } else {
                    patternClone.add(child.clone());
                }
            } else {
                // Meshes (dots, rings, polygons, images)
                patternClone.add(child.clone(true));
            }
        });

        exportRoot.add(patternClone);
    }

    // Apply Real-World Scale
    if (scaleMultiplier !== 1.0) {
        exportRoot.scale.set(scaleMultiplier, scaleMultiplier, scaleMultiplier);
    }

    exportRoot.updateMatrixWorld(true);
    return exportRoot;
}

/**
 * Export to Binary GLTF (.glb)
 */
export function exportToGLB(gourdMesh, carveGroup, patternGroup, options = {}) {
    const filename = (state.projectName || 'artisan-gourd') + '.glb';
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, triangulateLines: false });
    
    const exporter = new GLTFExporter();
    const exportOptions = {
        binary: true,
        embedImages: true,
        onlyVisible: true,
        truncateDrawRange: true
    };

    return new Promise((resolve, reject) => {
        exporter.parse(
            scene,
            (result) => {
                if (result instanceof ArrayBuffer) {
                    const blob = new Blob([result], { type: 'model/gltf-binary' });
                    downloadBlob(blob, filename);
                    resolve({ filename, sizeBytes: blob.size });
                } else {
                    const output = JSON.stringify(result, null, 2);
                    downloadText(output, filename.replace('.glb', '.gltf'), 'application/json');
                    resolve({ filename, sizeBytes: output.length });
                }
            },
            (error) => {
                console.error('GLTF Export error:', error);
                reject(error);
            },
            exportOptions
        );
    });
}

/**
 * Export to Wavefront OBJ (.obj)
 */
export function exportToOBJ(gourdMesh, carveGroup, patternGroup, options = {}) {
    const filename = (state.projectName || 'artisan-gourd') + '.obj';
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, triangulateLines: true });
    
    const exporter = new OBJExporter();
    const result = exporter.parse(scene);
    downloadText(result, filename, 'text/plain');
    return Promise.resolve({ filename, sizeBytes: result.length });
}

/**
 * Export to STL Binary (.stl) for 3D Printing & CAD Slicers
 */
export function exportToSTL(gourdMesh, carveGroup, patternGroup, options = {}) {
    const filename = (state.projectName || 'artisan-gourd') + '.stl';
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, triangulateLines: true, scaleUnit: options.scaleUnit || 'mm' });
    
    const exporter = new STLExporter();
    const result = exporter.parse(scene, { binary: true });
    
    if (result instanceof DataView || result instanceof ArrayBuffer) {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        downloadBlob(blob, filename);
        return Promise.resolve({ filename, sizeBytes: blob.size });
    } else {
        downloadText(result, filename, 'text/plain');
        return Promise.resolve({ filename, sizeBytes: result.length });
    }
}

/**
 * Export to Apple USDZ (.usdz) for iOS AR QuickLook
 */
export async function exportToUSDZ(gourdMesh, carveGroup, patternGroup, options = {}) {
    const filename = (state.projectName || 'artisan-gourd') + '.usdz';
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, scaleUnit: 'm', triangulateLines: false });
    
    const exporter = new USDZExporter();
    const arrayBuffer = await exporter.parse(scene);
    const blob = new Blob([arrayBuffer], { type: 'model/vnd.usdz+zip' });
    downloadBlob(blob, filename);
    return { filename, sizeBytes: blob.size };
}

/**
 * Export to Stanford PLY (.ply)
 */
export function exportToPLY(gourdMesh, carveGroup, patternGroup, options = {}) {
    const filename = (state.projectName || 'artisan-gourd') + '.ply';
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, triangulateLines: true });
    
    const exporter = new PLYExporter();
    const result = exporter.parse(scene, ['position', 'normal', 'uv', 'color'], { binary: true });
    
    if (result instanceof ArrayBuffer || result instanceof DataView) {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        downloadBlob(blob, filename);
        return Promise.resolve({ filename, sizeBytes: blob.size });
    } else {
        downloadText(result, filename, 'text/plain');
        return Promise.resolve({ filename, sizeBytes: result.length });
    }
}

/**
 * Calculates current mesh statistics
 */
export function getModelStats(gourdMesh, carveGroup, patternGroup) {
    let totalVertices = 0;
    let totalFaces = 0;

    function countMesh(mesh) {
        if (!mesh || !mesh.geometry) return;
        const geom = mesh.geometry;
        if (geom.attributes.position) {
            totalVertices += geom.attributes.position.count;
            if (geom.index) {
                totalFaces += geom.index.count / 3;
            } else {
                totalFaces += geom.attributes.position.count / 3;
            }
        }
    }

    if (gourdMesh) countMesh(gourdMesh);
    if (carveGroup) carveGroup.traverse(c => { if (c.isMesh) countMesh(c); });
    if (patternGroup) patternGroup.traverse(c => { if (c.isMesh) countMesh(c); });

    const gourdH_cm = state.gourdHeight || 30.0;
    const bulbW_cm = ((state.gourdBulbRadius || 9.0) * 2.0);
    const neckW_cm = ((state.gourdNeckRadius || 3.8) * 2.0);

    return {
        vertices: totalVertices,
        faces: Math.floor(totalFaces),
        heightCm: gourdH_cm.toFixed(1),
        widthCm: bulbW_cm.toFixed(1),
        neckWidthCm: neckW_cm.toFixed(1)
    };
}
