// Centralized Application State and History Management

export const state = {
    currentTool: 'select',
    activeTab: 'pattern',
    
    // Pattern parameters
    patternType: 'grid', // 'grid', 'diamond', 'zigzag', 'spiral'
    patternVisible: true,
    gridVisible: true,
    patRotation: 0,
    patTilt: 0,
    
    // Photoshop-like Pattern Zones (Layers)
    patternZones: [
        {
            id: 'zone-base',
            name: 'Base Layer',
            type: 'full', // 'full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'circular-patch'
            style: 'lines', // 'lines', 'holes', 'off'
            color: '#D4A843',
            opacity: 1.0,
            density: 1.0,
            distMode: 'count', // 'count' or 'distance'
            holeCount: 30,
            holeDistance: 0.06,
            holeSize: 0.03,
            dashSpacing: 0.0,
            
            // Bounds parameters (used depending on type)
            tMin: 0.0,
            tMax: 1.0,
            thetaMin: -Math.PI,
            thetaMax: Math.PI,
            centerT: 0.5,
            centerTheta: 0.0,
            radius: 0.3,
            slantAngle: 15,
            width: 0.15,
            shapeRotation: 0,
            direction: 'both',
            fillType: 'grid',
            visible: true,
            isCustomNamed: false,
            patternType: 'grid',
            holeShape: 'round',
            holeWobbleFreq: 5,
            holeWobbleAmp: 0.15
        }
    ],
    activeZoneId: 'zone-base',
    
    // Gourd physical dimension modeling & scanner photo overlay guide
    gourdHeight: 30.0,
    gourdBaseRadius: 3.5,
    gourdBulbRadius: 9.0,
    gourdNeckRadius: 3.8,
    gourdRimRadius: 2.7,
    gourdBulbPosition: 0.25,
    gourdBulbRoundness: 1.0,
    gourdNeckPosition: 0.55,
    gourdNeckRoundness: 1.0,
    gourdUpperNeckWidth: 3.24,
    gourdUpperNeckPosition: 0.78,
    gourdHasNeck: true,
    gourdBendX: 0.0,
    gourdBendZ: 0.0,
    gourdPhotoGuide: null,
    gourdPhotoOpacity: 0.4,
    gourdPhotoScale: 1.0,
    gourdPhotoX: 0,
    gourdPhotoY: 0,
    maskMode: 'include',
    patchCount: 1,
    
    // Decoupled stats tracking
    patternCount: 0,
    patternCountType: 'Lines',
    positionToolMode: 'shape', // 'shape' (moves mask shape) or 'camera' (rotates view)
    
    // Material parameters
    materialColor: '#C4956A',
    materialRoughness: 0.82,
    materialMetalness: 0.0,
    materialOpacity: 1.0,
    materialWireframe: false,
    materialFlatShading: false,
    
    // Carving parameters
    carveWidth: 0.015,
    carveColor: '#523620',
    carveDepth: 0.004, // offset (inwards or outwards relative to gourd surface)
    carvedPaths: [], // array of arrays of { t, theta }
    
    // Undo/Redo history
    undoStack: [],
    redoStack: []
};

// Captures a snapshot of the mesh transform and carving paths
export function pushUndoState(gourdMesh) {
    if (!gourdMesh) return;
    
    const snapshot = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode,
        fillType: state.fillType,
        holeShape: state.holeShape,
        holeWobbleFreq: state.holeWobbleFreq,
        holeWobbleAmp: state.holeWobbleAmp,
        gourdHeight: state.gourdHeight,
        gourdBaseRadius: state.gourdBaseRadius,
        gourdBulbRadius: state.gourdBulbRadius,
        gourdNeckRadius: state.gourdNeckRadius,
        gourdRimRadius: state.gourdRimRadius,
        gourdBulbPosition: state.gourdBulbPosition,
        gourdBulbRoundness: state.gourdBulbRoundness,
        gourdNeckPosition: state.gourdNeckPosition,
        gourdNeckRoundness: state.gourdNeckRoundness,
        gourdUpperNeckWidth: state.gourdUpperNeckWidth,
        gourdUpperNeckPosition: state.gourdUpperNeckPosition,
        gourdHasNeck: state.gourdHasNeck,
        gourdBendX: state.gourdBendX,
        gourdBendZ: state.gourdBendZ,
        maskMode: state.maskMode,
        patchCount: state.patchCount
    };
    
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) {
        state.undoStack.shift();
    }
    state.redoStack = []; // Clear redo stack on new operation
}

// Restores the previous state
export function performUndo(gourdMesh, onRestore) {
    if (!gourdMesh || state.undoStack.length === 0) return false;
    
    const snapshotToRedo = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode,
        fillType: state.fillType,
        holeShape: state.holeShape,
        holeWobbleFreq: state.holeWobbleFreq,
        holeWobbleAmp: state.holeWobbleAmp,
        gourdHeight: state.gourdHeight,
        gourdBaseRadius: state.gourdBaseRadius,
        gourdBulbRadius: state.gourdBulbRadius,
        gourdNeckRadius: state.gourdNeckRadius,
        gourdRimRadius: state.gourdRimRadius,
        gourdBulbPosition: state.gourdBulbPosition,
        gourdBulbRoundness: state.gourdBulbRoundness,
        gourdNeckPosition: state.gourdNeckPosition,
        gourdNeckRoundness: state.gourdNeckRoundness,
        gourdUpperNeckWidth: state.gourdUpperNeckWidth,
        gourdUpperNeckPosition: state.gourdUpperNeckPosition,
        gourdHasNeck: state.gourdHasNeck,
        gourdBendX: state.gourdBendX,
        gourdBendZ: state.gourdBendZ,
        maskMode: state.maskMode,
        patchCount: state.patchCount
    };
    state.redoStack.push(snapshotToRedo);
    
    const prevState = state.undoStack.pop();
    gourdMesh.position.copy(prevState.pos);
    gourdMesh.rotation.copy(prevState.rot);
    gourdMesh.scale.copy(prevState.scl);
    state.carvedPaths = prevState.carvedPaths;
    state.patternZones = prevState.patternZones;
    state.patRotation = prevState.patRotation;
    state.patTilt = prevState.patTilt;
    state.activeZoneId = prevState.activeZoneId;
    state.positionToolMode = prevState.positionToolMode;
    state.fillType = prevState.fillType;
    state.holeShape = prevState.holeShape;
    state.holeWobbleFreq = prevState.holeWobbleFreq;
    state.holeWobbleAmp = prevState.holeWobbleAmp;
    state.gourdHeight = prevState.gourdHeight;
    state.gourdBaseRadius = prevState.gourdBaseRadius;
    state.gourdBulbRadius = prevState.gourdBulbRadius;
    state.gourdNeckRadius = prevState.gourdNeckRadius;
    state.gourdRimRadius = prevState.gourdRimRadius;
    state.gourdBulbPosition = prevState.gourdBulbPosition;
    state.gourdBulbRoundness = prevState.gourdBulbRoundness;
    state.gourdNeckPosition = prevState.gourdNeckPosition;
    state.gourdNeckRoundness = prevState.gourdNeckRoundness;
    state.gourdUpperNeckWidth = prevState.gourdUpperNeckWidth;
    state.gourdUpperNeckPosition = prevState.gourdUpperNeckPosition;
    state.gourdHasNeck = prevState.gourdHasNeck;
    state.gourdBendX = prevState.gourdBendX;
    state.gourdBendZ = prevState.gourdBendZ;
    state.maskMode = prevState.maskMode;
    state.patchCount = prevState.patchCount;
    
    if (onRestore) onRestore();
    return true;
}

// Restores the next state
export function performRedo(gourdMesh, onRestore) {
    if (!gourdMesh || state.redoStack.length === 0) return false;
    
    const snapshotToUndo = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patternType: state.patternType,
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode,
        fillType: state.fillType,
        holeShape: state.holeShape,
        holeWobbleFreq: state.holeWobbleFreq,
        holeWobbleAmp: state.holeWobbleAmp,
        gourdHeight: state.gourdHeight,
        gourdBaseRadius: state.gourdBaseRadius,
        gourdBulbRadius: state.gourdBulbRadius,
        gourdNeckRadius: state.gourdNeckRadius,
        gourdRimRadius: state.gourdRimRadius,
        gourdBulbPosition: state.gourdBulbPosition,
        gourdBulbRoundness: state.gourdBulbRoundness,
        gourdNeckPosition: state.gourdNeckPosition,
        gourdNeckRoundness: state.gourdNeckRoundness,
        gourdUpperNeckWidth: state.gourdUpperNeckWidth,
        gourdUpperNeckPosition: state.gourdUpperNeckPosition,
        gourdHasNeck: state.gourdHasNeck,
        gourdBendX: state.gourdBendX,
        gourdBendZ: state.gourdBendZ,
        maskMode: state.maskMode,
        patchCount: state.patchCount
    };
    state.undoStack.push(snapshotToUndo);
    
    const nextState = state.redoStack.pop();
    gourdMesh.position.copy(nextState.pos);
    gourdMesh.rotation.copy(nextState.rot);
    gourdMesh.scale.copy(nextState.scl);
    state.carvedPaths = nextState.carvedPaths;
    state.patternZones = nextState.patternZones;
    state.patRotation = nextState.patRotation;
    state.patTilt = nextState.patTilt;
    state.activeZoneId = nextState.activeZoneId;
    state.positionToolMode = nextState.positionToolMode;
    state.fillType = nextState.fillType;
    state.holeShape = nextState.holeShape;
    state.holeWobbleFreq = nextState.holeWobbleFreq;
    state.holeWobbleAmp = nextState.holeWobbleAmp;
    state.gourdHeight = nextState.gourdHeight;
    state.gourdBaseRadius = nextState.gourdBaseRadius;
    state.gourdBulbRadius = nextState.gourdBulbRadius;
    state.gourdNeckRadius = nextState.gourdNeckRadius;
    state.gourdRimRadius = nextState.gourdRimRadius;
    state.gourdBulbPosition = nextState.gourdBulbPosition;
    state.gourdBulbRoundness = nextState.gourdBulbRoundness;
    state.gourdNeckPosition = nextState.gourdNeckPosition;
    state.gourdNeckRoundness = nextState.gourdNeckRoundness;
    state.gourdUpperNeckWidth = nextState.gourdUpperNeckWidth;
    state.gourdUpperNeckPosition = nextState.gourdUpperNeckPosition;
    state.gourdHasNeck = nextState.gourdHasNeck;
    state.gourdBendX = nextState.gourdBendX;
    state.gourdBendZ = nextState.gourdBendZ;
    state.maskMode = nextState.maskMode;
    state.patchCount = nextState.patchCount;
    
    if (onRestore) onRestore();
    return true;
}

// Photoshop-like Pattern Zone management helper functions
export function addPatternZone() {
    const id = 'zone-' + Math.random().toString(36).substr(2, 9);
    const newZone = {
        id: id,
        name: 'Full Gourd ' + (state.patternZones.length + 1),
        type: 'full',
        style: 'holes',
        color: '#D4A843',
        opacity: 1.0,
        density: 1.0,
        distMode: 'count',
        holeCount: 30,
        holeDistance: 0.06,
        holeSize: 0.03,
        dashSpacing: 0.0,
        
        tMin: 0.0,
        tMax: 1.0,
        thetaMin: -Math.PI,
        thetaMax: Math.PI,
        centerT: 0.5,
        centerTheta: 0.0,
        radius: 0.3,
        slantAngle: 15,
        width: 0.15,
        shapeRotation: 0,
        direction: 'both',
        fillType: 'grid',
        visible: true,
        isCustomNamed: false,
        patternType: 'grid',
        holeShape: 'round',
        holeWobbleFreq: 5,
        holeWobbleAmp: 0.15,
        leanAngle: 0.0,
        maskMode: 'include',
        patchCount: 1,
        clipBackground: true
    };
    state.patternZones.push(newZone);
    return newZone;
}

export function removePatternZone(id) {
    state.patternZones = state.patternZones.filter(z => z.id !== id);
}

export function duplicatePatternZone(id) {
    const zoneToCopy = state.patternZones.find(z => z.id === id);
    if (!zoneToCopy) return;
    const clone = JSON.parse(JSON.stringify(zoneToCopy));
    clone.id = 'zone-' + Math.random().toString(36).substr(2, 9);
    clone.name = clone.name + ' (Copy)';
    state.patternZones.push(clone);
}

export function movePatternZoneUp(id) {
    const idx = state.patternZones.findIndex(z => z.id === id);
    if (idx <= 0) return;
    const tmp = state.patternZones[idx];
    state.patternZones[idx] = state.patternZones[idx - 1];
    state.patternZones[idx - 1] = tmp;
}

export function movePatternZoneDown(id) {
    const idx = state.patternZones.findIndex(z => z.id === id);
    if (idx < 0 || idx >= state.patternZones.length - 1) return;
    const tmp = state.patternZones[idx];
    state.patternZones[idx] = state.patternZones[idx + 1];
    state.patternZones[idx + 1] = tmp;
}
