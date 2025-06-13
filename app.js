import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as culori from 'culori';

// DOM Elements
const lightnessSlider = document.getElementById('lightness-slider');
const chromaSlider = document.getElementById('chroma-slider');
const colorCountInput = document.getElementById('color-count');
const hueCanvas = document.getElementById('hue-canvas');
const paletteContainer = document.getElementById('palette-container');
const findMaxLBtn = document.getElementById('find-max-l-btn');
const findMaxCBtn = document.getElementById('find-max-c-btn');
const lockToEdgeCheckbox = document.getElementById('lock-to-edge-checkbox');
const sweetSpotSlider = document.getElementById('sweet-spot-slider');
const threeDContainer = document.getElementById('3d-container');
const threeDPlaceholder = document.getElementById('3d-placeholder');
const threeDControls = document.getElementById('3d-controls');
const show3DBtn = document.getElementById('show-3d-btn');
const toggleFullGamutCheckbox = document.getElementById('toggle-full-gamut');
const toggleSafeGamutCheckbox = document.getElementById('toggle-safe-gamut');
const copyHexBtn = document.getElementById('copy-hex-btn');
const hueMarkersContainer = document.getElementById('hue-markers-container');
const lightnessValueInput = document.getElementById('lightness-value-input');
const chromaValueInput = document.getElementById('chroma-value-input');
const threeDInstructions = document.getElementById('3d-instructions');
const sweetSpotValueInput = document.getElementById('sweet-spot-value-input');
const lcGraphCanvas = document.getElementById('lc-graph-canvas');
const findMaxSweetSpotBtn = document.getElementById('find-max-sweet-spot-btn');


// App State
let scene, camera, renderer, controls, paletteGroup, gamutMesh, safeGamutMesh;
let is3DInitialized = false;
let sweetSpotPath = [];
let currentPalette = [];
let startHue = 0;

const oklchConverter = culori.converter('oklab');

function init3D() {
    const containerWidth = threeDContainer.clientWidth;
    const containerHeight = threeDContainer.clientHeight;
    
    if (containerWidth === 0 || containerHeight === 0) {
        threeDPlaceholder.innerHTML = '<p class="info">Error: Could not determine container size for 3D view.</p>';
        threeDPlaceholder.classList.remove('hidden');
        threeDContainer.classList.add('hidden');
        return false;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, containerWidth / containerHeight, 0.1, 1000);
    camera.position.set(0, 0.5, 1.2);
    camera.lookAt(0, 0.5, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(containerWidth, containerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    threeDContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.5, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 2, 3);
    scene.add(ambientLight, directionalLight);

    paletteGroup = new THREE.Group();
    scene.add(paletteGroup);

    if (!gamutMesh) gamutMesh = createGamutShellMesh();
    scene.add(gamutMesh);
    
    if (!safeGamutMesh) safeGamutMesh = createSafeGamutShellMesh();
    scene.add(safeGamutMesh);

    gamutMesh.visible = toggleFullGamutCheckbox.checked;
    safeGamutMesh.visible = toggleSafeGamutCheckbox.checked;

    is3DInitialized = true;
    
    function animate() {
        if (!renderer) return;
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
    return true;
}

function oklchToLab3D(l, c, h) {
    const lab = oklchConverter({ mode: 'oklch', l, c, h });
    return new THREE.Vector3(lab.a * 2.0, lab.l, lab.b * 2.0);
}

function createGamutShellMesh() {
    const geometry = new THREE.BufferGeometry();
    const positions = [], colors = [], indices = [];
    const l_steps = 40, h_steps = 72;
    for (let i = 0; i <= l_steps; i++) {
        const l = i / l_steps;
        for (let j = 0; j <= h_steps; j++) {
            const h = (j / h_steps) * 360;
            const colorAtCusp = culori.clampChroma({ mode: 'oklch', l, h, c: 0.5 }, 'oklch');
            positions.push(...oklchToLab3D(colorAtCusp.l, colorAtCusp.c, colorAtCusp.h).toArray());
            const rgb = culori.converter('rgb')(colorAtCusp);
            colors.push(rgb.r, rgb.g, rgb.b);
        }
    }
    for (let i = 0; i < l_steps; i++) {
        for (let j = 0; j < h_steps; j++) {
            const a = i * (h_steps + 1) + j, b = a + 1;
            const c = (i + 1) * (h_steps + 1) + (j + 1), d = (i + 1) * (h_steps + 1) + j;
            indices.push(a, b, d, b, c, d);
        }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9
    }));
}

function createSafeGamutShellMesh() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [], indices = [];
    const l_steps = 20, h_steps = 36;
    for (let i = 0; i <= l_steps; i++) {
        const l = i / l_steps;
        let safeChroma = findMaxSafeChromaForL(l);
        for (let j = 0; j <= h_steps; j++) {
            const h = (j / h_steps) * 360;
            vertices.push(...oklchToLab3D(l, safeChroma, h).toArray());
        }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    for (let i = 0; i < l_steps; i++) {
        for (let j = 0; j < h_steps; j++) {
            const a = i * (h_steps + 1) + j, b = i * (h_steps + 1) + (j + 1);
            const c = (i + 1) * (h_steps + 1) + (j + 1), d = (i + 1) * (h_steps + 1) + j;
            indices.push(a, b, d, b, c, d);
        }
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xaaaaee, wireframe: true, roughness: 0.7, side: THREE.DoubleSide }));
}

function update3DVisualization() {
    if (!is3DInitialized) return;
    while (paletteGroup.children.length > 0) paletteGroup.remove(paletteGroup.children[0]);
    const sphereGeometry = new THREE.SphereGeometry(0.03, 32, 16);
    
    currentPalette.forEach(color => {
        const material = new THREE.MeshStandardMaterial({
            color: color.inGamut ? color.hex : 0xffffff,
            roughness: 0.5
        });
        const sphere = new THREE.Mesh(sphereGeometry, material);
        sphere.position.copy(oklchToLab3D(color.oklch.l, color.oklch.c, color.oklch.h));
        paletteGroup.add(sphere);
    });
}

function drawLCGraph(l, c) {
    const ctx = lcGraphCanvas.getContext('2d');
    const width = lcGraphCanvas.width;
    const height = lcGraphCanvas.height;
    const padding = 20;
    const maxC = 0.4; // Corresponds to the chroma slider max

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#4a4a6e'; 
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 4; i++) {
        const y = height - padding - (i * (height - padding * 2) / 4);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
        const x = padding + (i * (width - padding * 2) / 4);
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
    }
    
    ctx.strokeStyle = '#b0b0d0'; 
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    if (lockToEdgeCheckbox.checked && sweetSpotPath.length > 0) {
        ctx.strokeStyle = '#00aaff'; 
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < sweetSpotPath.length; i++) {
            const point = sweetSpotPath[i];
            const x = padding + (point.l * (width - padding * 2));
            const y = (height - padding) - (point.c / maxC * (height - padding * 2));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    const pointX = padding + (l * (width - padding * 2));
    const pointY = (height - padding) - (c / maxC * (height - padding * 2));
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pointX, pointY, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

function updateApp() {
    let l, c;
    const count = parseInt(colorCountInput.value, 10);

    if (lockToEdgeCheckbox.checked) {
        const index = parseInt(sweetSpotSlider.value, 10);
        const point = sweetSpotPath[index];
        if (point) {
            l = point.l;
            c = point.c;
            lightnessSlider.value = l;
            chromaSlider.value = c;
        } else {
            l = parseFloat(lightnessSlider.value);
            c = parseFloat(chromaSlider.value);
        }
        const normalizedValue = sweetSpotSlider.value / (sweetSpotSlider.max || 1);
        if (document.activeElement !== sweetSpotValueInput) {
             sweetSpotValueInput.value = normalizedValue.toFixed(3);
        }
    } else {
        l = parseFloat(lightnessSlider.value);
        c = parseFloat(chromaSlider.value);
    }
    
    if (document.activeElement !== lightnessValueInput) lightnessValueInput.value = l.toFixed(3);
    if (document.activeElement !== chromaValueInput) chromaValueInput.value = c.toFixed(3);
    
    currentPalette = [];
    const hueStep = 360 / count;
    for (let i = 0; i < count; i++) {
        const h = (startHue + i * hueStep) % 360;
        currentPalette.push({ oklch: { mode: 'oklch', l, c, h }, hex: culori.formatHex({ mode: 'oklch', l, c, h }), inGamut: culori.displayable({ mode: 'oklch', l, c, h }) });
    }
    
    drawLCGraph(l, c);
    renderPaletteSwatches();
    drawHueGradient(l, c);
    update3DVisualization();
}

function renderPaletteSwatches() {
    paletteContainer.innerHTML = '';
    currentPalette.forEach(color => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = color.inGamut ? color.hex : '#555';
        swatch.innerHTML = `<span>${color.hex}</span>`;
        if (!color.inGamut) swatch.classList.add('out-of-gamut');
        paletteContainer.appendChild(swatch);
    });
}

function drawHueGradient(l, c) {
    const ctx = hueCanvas.getContext('2d');
    const width = hueCanvas.width;
    for (let x = 0; x < width; x++) {
        const h = (x / width) * 360;
        ctx.fillStyle = culori.displayable({ mode: 'oklch', l, c, h }) ? culori.formatHex({ mode: 'oklch', l, c, h }) : '#808080';
        ctx.fillRect(x, 0, 1, hueCanvas.height);
    }
    hueMarkersContainer.innerHTML = '';
    currentPalette.forEach(color => {
        const marker = document.createElement('div');
        marker.className = 'hue-marker';
        marker.style.left = `${((color.oklch.h - startHue + 360) % 360) / 360 * 100}%`;
        hueMarkersContainer.appendChild(marker);
    });
}

function isChromaSafeForAllHues(l, c) {
    if (l <= 0.01 || l >= 0.99) return false;
    for (let h = 0; h < 360; h += 5) {
        if (!culori.displayable({ mode: 'oklch', l, c, h })) return false;
    }
    return true;
}

function findMaxSafeChromaForL(l) {
    for (let c = 0.4; c >= 0; c -= 0.001) {
        if (isChromaSafeForAllHues(l, c)) return c;
    }
    return 0;
}

function findMaxSafeLightnessForC(c) {
    for (let l = 0.99; l > 0.01; l -= 0.01) {
        if (isChromaSafeForAllHues(l, c)) return l;
    }
    return parseFloat(lightnessSlider.value);
}

function precalculateSweetSpotPath() {
    sweetSpotPath = [];
    for (let i = 0; i <= 200; i++) {
        const l = i / 200;
        sweetSpotPath.push({ l, c: findMaxSafeChromaForL(l) });
    }
}

function init() {
    precalculateSweetSpotPath();
    sweetSpotSlider.max = sweetSpotPath.length - 1;

    const allControls = [lightnessSlider, chromaSlider, colorCountInput, sweetSpotSlider];
    allControls.forEach(control => control.addEventListener('input', updateApp));
    
    hueCanvas.addEventListener('click', (event) => {
        const rect = hueCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        startHue = (x / hueCanvas.clientWidth) * 360;
        updateApp();
    });

    findMaxCBtn.addEventListener('click', () => {
        chromaSlider.value = findMaxSafeChromaForL(parseFloat(lightnessSlider.value));
        updateApp();
    });
    findMaxLBtn.addEventListener('click', () => {
        lightnessSlider.value = findMaxSafeLightnessForC(parseFloat(chromaSlider.value));
        updateApp();
    });

    findMaxSweetSpotBtn.addEventListener('click', () => {
        if (sweetSpotPath.length === 0) return;
        const maxChromaPoint = sweetSpotPath.reduce((max, point) => point.c > max.c ? point : max, sweetSpotPath[0]);
        const maxIndex = sweetSpotPath.indexOf(maxChromaPoint);
        sweetSpotSlider.value = maxIndex;
        updateApp();
    });

    lockToEdgeCheckbox.addEventListener('change', event => {
        const isLocked = event.target.checked;
        const sweetSpotSteppers = document.querySelectorAll('.stepper[data-for="sweet-spot-slider"]');
        
        sweetSpotSlider.disabled = !isLocked;
        sweetSpotValueInput.disabled = !isLocked;
        findMaxSweetSpotBtn.disabled = !isLocked;
        sweetSpotSteppers.forEach(b => b.disabled = !isLocked);

        lightnessSlider.disabled = isLocked;
        chromaSlider.disabled = isLocked;
        lightnessValueInput.disabled = isLocked;
        chromaValueInput.disabled = isLocked;
        
        if (isLocked) {
            const currentL = parseFloat(lightnessSlider.value);
            let closestIndex = 0, minDistance = 1;
            sweetSpotPath.forEach((point, index) => {
                const distance = Math.abs(point.l - currentL);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = index;
                }
            });
            sweetSpotSlider.value = closestIndex;
        }
        updateApp();
    });

    sweetSpotValueInput.addEventListener('change', (e) => {
        const normalizedValue = parseFloat(e.target.value);
        if (!isNaN(normalizedValue)) {
            const clampedValue = Math.max(0, Math.min(1, normalizedValue));
            const sliderValue = Math.round(clampedValue * sweetSpotSlider.max);
            sweetSpotSlider.value = sliderValue;
            updateApp();
        }
    });

    document.querySelectorAll('.value-input').forEach(input => {
        if (input.id === 'sweet-spot-value-input') return;
        input.addEventListener('change', (e) => {
            const sliderId = e.target.id.replace('-value-input', '-slider');
            document.getElementById(sliderId).value = e.target.value;
            updateApp();
        });
    });

    document.querySelectorAll('.stepper').forEach(button => {
        button.addEventListener('click', (e) => {
            const slider = document.getElementById(e.target.dataset.for);
            const step = parseFloat(e.target.dataset.step);
            slider.value = (parseFloat(slider.value) + step).toFixed(4);
            updateApp();
        });
    });

    copyHexBtn.addEventListener('click', () => {
        const hexCodes = currentPalette.map(color => color.hex).join('\t');
        navigator.clipboard.writeText(hexCodes).then(() => {
            copyHexBtn.textContent = 'Copied!';
            setTimeout(() => { copyHexBtn.textContent = 'Copy Hex Codes'; }, 1500);
        });
    });
    
    show3DBtn.addEventListener('click', () => {
        if (is3DInitialized) return;
    
        threeDPlaceholder.classList.add('hidden');
        threeDContainer.classList.remove('hidden');
        threeDControls.classList.remove('hidden');
        threeDInstructions.classList.remove('hidden');
    
        requestAnimationFrame(() => {
            const containerWidth = threeDContainer.clientWidth;
            const height = containerWidth * 0.75;
            threeDContainer.style.height = `${height}px`;
    
            if (init3D()) {
                updateApp();
            } else {
                threeDControls.classList.add('hidden');
                threeDInstructions.classList.add('hidden');
                threeDContainer.style.height = '';
            }
        });
    });

    toggleFullGamutCheckbox.addEventListener('change', (e) => { if (gamutMesh) gamutMesh.visible = e.target.checked; });
    toggleSafeGamutCheckbox.addEventListener('change', (e) => { if (safeGamutMesh) safeGamutMesh.visible = e.target.checked; });
    
    window.addEventListener('resize', () => {
        if (!is3DInitialized || !renderer) return;

        const containerWidth = threeDContainer.clientWidth;
        if (containerWidth === 0) return;
        const height = containerWidth * 0.75;
        threeDContainer.style.height = `${height}px`;
        
        camera.aspect = containerWidth / height;
        camera.updateProjectionMatrix();
        renderer.setSize(containerWidth, height);
    });

    updateApp();
}

window.addEventListener('load', init);