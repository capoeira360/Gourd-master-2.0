import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
 * Converts an InstancedMesh (e.g. drill holes / decorative pattern dots) into
 * a solid, manifold 3D merged mesh with depth so that it renders identically
 * and without clipping/z-fighting across all 3D formats (GLB, OBJ, STL, USDZ, PLY).
 */
function convertInstancedMeshToSolidMesh(instancedMesh) {
    if (!instancedMesh || !instancedMesh.geometry || instancedMesh.count === 0) return null;

    const count = instancedMesh.count;
    const baseGeom = instancedMesh.geometry;

    let solidTemplateGeom;

    if (baseGeom.type === 'CircleGeometry' || (baseGeom.parameters && baseGeom.parameters.radius !== undefined)) {
        const radius = baseGeom.parameters?.radius || 1.0;
        const segments = Math.max(14, Math.min(24, baseGeom.parameters?.segments || 16));
        
        // Depth is scaled proportionally
        const depth = radius > 0.5 ? 0.35 : Math.max(0.012, radius * 0.5);
        
        // Three.js CylinderGeometry has height along Y; rotate by 90deg on X so normal aligns with +Z
        solidTemplateGeom = new THREE.CylinderGeometry(radius, radius, depth, segments);
        solidTemplateGeom.rotateX(Math.PI / 2);
        
        // Shift outward so top cap sits clean and elevated above surface (+0.003 units)
        // and base penetrates into shell to prevent any gap or clipping
        solidTemplateGeom.translate(0, 0, depth * 0.35);
        solidTemplateGeom.computeVertexNormals();
    } else if (baseGeom.parameters && baseGeom.parameters.shapes) {
        try {
            solidTemplateGeom = new THREE.ExtrudeGeometry(baseGeom.parameters.shapes, {
                depth: 0.015,
                bevelEnabled: false,
                curveSegments: 16
            });
            solidTemplateGeom.translate(0, 0, 0.004);
            solidTemplateGeom.computeVertexNormals();
        } catch (e) {
            solidTemplateGeom = baseGeom.clone();
        }
    } else {
        solidTemplateGeom = baseGeom.clone();
    }

    if (!solidTemplateGeom.attributes.normal) {
        solidTemplateGeom.computeVertexNormals();
    }

    const geometries = [];
    const matrix = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
        instancedMesh.getMatrixAt(i, matrix);
        const geomCopy = solidTemplateGeom.clone();
        geomCopy.applyMatrix4(matrix);
        geometries.push(geomCopy);
    }

    solidTemplateGeom.dispose();

    if (geometries.length === 0) return null;

    let mergedGeom = null;
    try {
        mergedGeom = mergeGeometries(geometries, false);
    } catch (e) {
        console.error('Error merging hole geometries for export:', e);
    }

    // Free instance geometries
    geometries.forEach(g => g.dispose());

    if (!mergedGeom) return null;

    const baseColor = (instancedMesh.material && instancedMesh.material.color)
        ? instancedMesh.material.color.clone()
        : new THREE.Color(0xD4A843);

    const mat = new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: 0.35,
        metalness: 0.25,
        side: THREE.DoubleSide,
        depthWrite: true,
        transparent: false
    });

    const mesh = new THREE.Mesh(mergedGeom, mat);
    mesh.name = instancedMesh.name || 'Hole_Pattern_Mesh';
    return mesh;
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
        triangulateLines = true
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

    // 1. Gourd Body Mesh (Clean single mesh, no nested children)
    if (includeGourd && gourdMesh) {
        const bodyMat = gourdMesh.material
            ? gourdMesh.material.clone()
            : new THREE.MeshStandardMaterial({ color: 0xc89658, roughness: 0.6 });

        if (bodyMat.map && gourdMesh.material && gourdMesh.material.map) {
            bodyMat.map = gourdMesh.material.map;
        }
        bodyMat.side = THREE.DoubleSide;

        const bodyMesh = new THREE.Mesh(gourdMesh.geometry.clone(), bodyMat);
        bodyMesh.name = 'Gourd_Body';
        bodyMesh.position.copy(gourdMesh.position);
        bodyMesh.rotation.copy(gourdMesh.rotation);
        bodyMesh.scale.copy(gourdMesh.scale);
        exportRoot.add(bodyMesh);
    }

    // 2. 3D Carved Typography
    if (includeCarvings && carveGroup && carveGroup.children.length > 0) {
        const carveClone = new THREE.Group();
        carveClone.name = 'Carved_Lettering';
        carveClone.position.copy(carveGroup.position);
        carveClone.rotation.copy(carveGroup.rotation);
        carveClone.scale.copy(carveGroup.scale);

        carveGroup.children.forEach(child => {
            if (child.isMesh) {
                const meshClone = child.clone(true);
                if (meshClone.material) {
                    meshClone.material = meshClone.material.clone();
                    meshClone.material.depthWrite = true;
                    meshClone.material.side = THREE.DoubleSide;
                }
                carveClone.add(meshClone);
            } else {
                carveClone.add(child.clone(true));
            }
        });
        exportRoot.add(carveClone);
    }

    // 3. Decorative Patterns & Drill Holes (Baked to solid 3D manifold meshes)
    if (includePatterns && patternGroup && patternGroup.children.length > 0) {
        const patternClone = new THREE.Group();
        patternClone.name = 'Surface_Patterns';
        patternClone.position.copy(patternGroup.position);
        patternClone.rotation.copy(patternGroup.rotation);
        patternClone.scale.copy(patternGroup.scale);

        patternGroup.children.forEach((child, idx) => {
            if (child.isInstancedMesh) {
                const solidMesh = convertInstancedMeshToSolidMesh(child);
                if (solidMesh) {
                    solidMesh.name = `Pattern_Holes_${idx}`;
                    patternClone.add(solidMesh);
                }
            } else if (child.isLine || child.isLineSegments || child.isLineLoop) {
                if (triangulateLines && child.geometry) {
                    try {
                        const pos = child.geometry.attributes.position;
                        if (pos && pos.count >= 2) {
                            const points = [];
                            for (let i = 0; i < pos.count; i++) {
                                points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
                            }
                            if (points.length >= 2) {
                                const curve = new THREE.CatmullRomCurve3(points);
                                const tubeGeom = new THREE.TubeGeometry(curve, Math.min(128, points.length * 2), 0.006, 6, false);
                                const color = (child.material && child.material.color) ? child.material.color.clone() : new THREE.Color(0xD4A843);
                                const tubeMat = new THREE.MeshStandardMaterial({
                                    color: color,
                                    roughness: 0.35,
                                    metalness: 0.3,
                                    side: THREE.DoubleSide
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
            } else if (child.isMesh) {
                const meshClone = child.clone(true);
                if (meshClone.material) {
                    meshClone.material = meshClone.material.clone();
                    meshClone.material.depthWrite = true;
                    meshClone.material.side = THREE.DoubleSide;
                }
                patternClone.add(meshClone);
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
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, triangulateLines: true });
    
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
    const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, { ...options, scaleUnit: 'm', triangulateLines: true });
    
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
 * Calculates current mesh statistics matching the exported 3D model
 */
export function getModelStats(gourdMesh, carveGroup, patternGroup, options = {}) {
    let totalVertices = 0;
    let totalFaces = 0;

    try {
        const scene = buildExportScene(gourdMesh, carveGroup, patternGroup, {
            includeGourd: options.includeGourd ?? true,
            includePatterns: options.includePatterns ?? true,
            includeCarvings: options.includeCarvings ?? true,
            scaleUnit: 'raw',
            triangulateLines: true
        });

        scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const geom = child.geometry;
                if (geom.attributes && geom.attributes.position) {
                    totalVertices += geom.attributes.position.count;
                    if (geom.index) {
                        totalFaces += geom.index.count / 3;
                    } else {
                        totalFaces += geom.attributes.position.count / 3;
                    }
                }
            }
        });

        // Dispose temporary geometries to release memory
        scene.traverse((child) => {
            if (child.isMesh && child.geometry) {
                child.geometry.dispose();
            }
        });
    } catch (e) {
        console.error('Error calculating model stats:', e);
    }

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

