#!/usr/bin/env node
/**
 * Arma la isla medieval de prueba (BLOG-129) con el KayKit Medieval Hexagon
 * Pack 1.0 de Kay Lousberg (CC0): un pueblo con castillo sobre 37 hexágonos y
 * una base de roca colgando, como diorama flotante.
 *
 * Uso: node scripts/build-island-medieval.mjs
 *
 * 1. Baja el pack de GitHub en un commit fijo, a una carpeta temporal fuera
 *    del repo, y comprueba su sha256.
 * 2. Compone la escena: cada modelo del pack entra una vez (sus mallas se
 *    reutilizan en todas las copias) con su posición, giro y escala.
 * 3. Con glTF Transform (CLI, versión exacta, sin instalarlo en el repo):
 *    prune y dedup, que no agregan extensiones ni decoders.
 * 4. Lo escribe como .gltf con el .bin y la textura aparte en
 *    apps/web/public/models/isla-medieval/ (sin URLs blob:, por la CSP).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1';
const PACK_COMMIT = '84fa4e91af6a88989be7c99e0891cede11f2ca38';
const PACK_URL = `https://codeload.github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0/tar.gz/${PACK_COMMIT}`;
const PACK_SHA256 = 'd26bae21b792a9386920118d6787dc8ec0f9c3d37c2d6d59be3e153ef98346f9';
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'models', 'isla-medieval');
const OUT_FILE = 'isla.gltf';

// --- Composición -------------------------------------------------------------

/** Centro de un hexágono (puntiagudo hacia z, 2 de ancho) en coordenadas axiales. */
function hex(q, r) {
  return [2 * q + r, Math.sqrt(3) * r];
}

const DEG = Math.PI / 180;
/** Cuaternión de un giro alrededor de y (grados). */
const yaw = (degrees) => [0, Math.sin((degrees * DEG) / 2), 0, Math.cos((degrees * DEG) / 2)];

/**
 * Qué hay en cada hexágono (q, r) de radio 3. Lo que no aparece es hierba.
 * `rot` en grados alrededor de y.
 */
const TILES = {
  '0,0': [{ asset: 'buildings/red/building_castle_red', rot: 30 }],
  // Anillo 1: el centro del pueblo.
  '1,0': [{ asset: 'buildings/red/building_church_red', rot: 90 }],
  '1,-1': [{ asset: 'buildings/red/building_tavern_red', rot: 150 }],
  '0,-1': [{ asset: 'buildings/red/building_market_red', rot: 210 }],
  '-1,0': [{ asset: 'buildings/red/building_home_A_red', rot: 270 }],
  '-1,1': [{ asset: 'buildings/red/building_well_red', rot: 0 }],
  '0,1': [{ asset: 'buildings/red/building_home_B_red', rot: 30 }],
  // Anillo 2: casas, oficios y el molino.
  '2,0': [{ asset: 'buildings/red/building_home_A_red', rot: 120 }],
  '2,-1': [{ asset: 'buildings/red/building_blacksmith_red', rot: 120 }],
  '2,-2': [{ asset: 'buildings/red/building_tower_A_red', rot: 0 }],
  '1,-2': [{ asset: 'buildings/red/building_home_B_red', rot: 180 }],
  '0,-2': [{ asset: 'buildings/red/building_home_A_red', rot: 240 }],
  '-1,-1': [{ asset: 'buildings/red/building_lumbermill_red', rot: 240 }],
  '-2,0': [{ asset: 'buildings/red/building_windmill_red', rot: 300 }],
  '-2,1': [{ asset: 'buildings/neutral/building_grain', rot: 0 }],
  '-2,2': [{ asset: 'buildings/red/building_tower_B_red', rot: 0 }],
  '-1,2': [{ asset: 'buildings/red/building_home_B_red', rot: 330 }],
  '0,2': [{ asset: 'buildings/red/building_home_A_red', rot: 0 }],
  '1,1': [{ asset: 'decoration/nature/trees_A_medium', rot: 0 }],
  // Anillo 3: bosque, colinas, una montaña y campos.
  '3,0': [{ asset: 'decoration/nature/trees_B_large', rot: 0 }],
  '3,-1': [{ asset: 'decoration/nature/hills_A_trees', rot: 60 }],
  '3,-2': [{ asset: 'decoration/nature/trees_A_large', rot: 0 }],
  '3,-3': [{ asset: 'decoration/nature/mountain_C_grass_trees', rot: 0 }],
  '2,-3': [{ asset: 'decoration/nature/mountain_B_grass_trees', rot: 120 }],
  '1,-3': [{ asset: 'decoration/nature/trees_B_medium', rot: 0 }],
  '0,-3': [{ asset: 'buildings/neutral/building_stage_A', rot: 180 }],
  '-1,-2': [{ asset: 'decoration/nature/trees_A_small', rot: 0 }],
  '-2,-1': [{ asset: 'decoration/nature/hills_B_trees', rot: 0 }],
  '-3,0': [{ asset: 'decoration/nature/trees_B_large', rot: 90 }],
  '-3,1': [{ asset: 'buildings/neutral/building_grain', rot: 60 }],
  '-3,2': [{ asset: 'decoration/nature/trees_A_medium', rot: 30 }],
  '-3,3': [{ asset: 'decoration/nature/hills_C_trees', rot: 0 }],
  '-2,3': [{ asset: 'decoration/nature/trees_A_large', rot: 0 }],
  '-1,3': [{ asset: 'decoration/nature/tree_single_B', rot: 0 }],
  '0,3': [{ asset: 'decoration/nature/trees_B_small', rot: 0 }],
  '1,2': [{ asset: 'decoration/nature/rock_single_E', rot: 0 }],
  '2,1': [{ asset: 'decoration/nature/trees_A_small', rot: 60 }],
};

/** Detalles sobre los hexágonos del pueblo: [asset, q, r, dx, dz, giro]. */
const PROPS = [
  ['decoration/props/barrel', 1, -1, 0.65, 0.35, 0],
  ['decoration/props/crate_A_small', 1, -1, 0.7, -0.1, 20],
  ['decoration/props/sack', 0, -1, -0.6, 0.45, 0],
  ['decoration/props/crate_B_small', 0, -1, -0.7, 0.0, 40],
  ['decoration/props/resource_lumber', -1, -1, 0.55, 0.5, 30],
  ['decoration/props/wheelbarrow', 2, -1, -0.55, 0.55, 200],
  ['decoration/props/flag_red', 2, -2, 0.6, 0.6, 0],
  ['decoration/props/flag_red', -2, 2, -0.6, -0.6, 0],
  ['decoration/props/bucket_water', -1, 1, 0.6, 0.3, 0],
];

/** Rocas boca abajo debajo de la isla: [asset, x, z, escala, giro]. */
const ROCKS = [
  ['decoration/nature/mountain_A', 0, 0, 5.5, 0],
  ['decoration/nature/mountain_B', 2.8, -2.2, 3.0, 60],
  ['decoration/nature/mountain_C', -3.0, 1.8, 3.2, 140],
  ['decoration/nature/mountain_A', 3.2, 2.6, 2.2, 220],
  ['decoration/nature/mountain_B', -2.4, -3.2, 2.5, 300],
];

/** Nubes alrededor: [asset, x, y, z, escala]. */
const CLOUDS = [
  ['decoration/nature/cloud_big', -6.8, 1.2, -2.5, 0.9],
  ['decoration/nature/cloud_small', 6.6, -1.2, 2.8, 0.9],
  ['decoration/nature/cloud_big', 3.5, -4.2, -5.2, 0.7],
];

// --- glTF a mano: juntar modelos del pack en un solo documento ----------------

/** Documento de salida y los modelos ya añadidos (cada uno, una vez). */
const out = { asset: { version: '2.0', generator: 'scripts/build-island-medieval.mjs' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], textures: [], images: [], samplers: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
const binChunks = [];
let binLength = 0;
const loaded = new Map();

/** Copia un modelo del pack al documento (buffers, accesores, mallas, materiales) y devuelve sus nodos raíz como plantilla. */
function load(assets, path) {
  if (loaded.has(path)) {
    return loaded.get(path);
  }
  const file = join(assets, `${path}.gltf`);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if ((json.extensionsRequired ?? []).length > 0) {
    throw new Error(`${path} requiere extensiones: ${json.extensionsRequired.join(', ')}`);
  }
  const base = dirname(file);
  // Un .bin por modelo: va al final del buffer único, alineado a 4.
  const bin = readFileSync(join(base, json.buffers[0].uri));
  const offset = binLength;
  const padded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  binChunks.push(padded);
  binLength += padded.length;

  const viewBase = out.bufferViews.length;
  for (const view of json.bufferViews) {
    out.bufferViews.push({ ...view, buffer: 0, byteOffset: (view.byteOffset ?? 0) + offset });
  }
  const accessorBase = out.accessors.length;
  for (const accessor of json.accessors) {
    out.accessors.push({ ...accessor, bufferView: accessor.bufferView + viewBase });
  }
  const samplerBase = out.samplers.length;
  out.samplers.push(...(json.samplers ?? []));
  const imageBase = out.images.length;
  for (const image of json.images ?? []) {
    out.images.push({ name: 'hexagons_medieval', uri: join(base, image.uri) });
  }
  const textureBase = out.textures.length;
  for (const texture of json.textures ?? []) {
    out.textures.push({ ...texture, source: texture.source + imageBase, ...(texture.sampler === undefined ? {} : { sampler: texture.sampler + samplerBase }) });
  }
  const materialBase = out.materials.length;
  for (const material of json.materials ?? []) {
    const copy = structuredClone(material);
    const color = copy.pbrMetallicRoughness?.baseColorTexture;
    if (color) {
      color.index += textureBase;
    }
    out.materials.push(copy);
  }
  const meshBase = out.meshes.length;
  for (const mesh of json.meshes) {
    out.meshes.push({
      ...mesh,
      primitives: mesh.primitives.map((primitive) => ({
        ...primitive,
        attributes: Object.fromEntries(Object.entries(primitive.attributes).map(([key, index]) => [key, index + accessorBase])),
        ...(primitive.indices === undefined ? {} : { indices: primitive.indices + accessorBase }),
        ...(primitive.material === undefined ? {} : { material: primitive.material + materialBase }),
      })),
    });
  }
  // Plantilla de nodos: se copia en cada instancia, con las mallas compartidas.
  const template = { nodes: json.nodes, meshBase, roots: json.scenes[json.scene ?? 0].nodes };
  loaded.set(path, template);
  return template;
}

/** Añade una copia de un modelo con su transformación, colgando de la escena. */
function place(assets, path, { translation, rotation = [0, 0, 0, 1], scale = [1, 1, 1] }) {
  const template = load(assets, path);
  const copy = (index) => {
    const node = template.nodes[index];
    const created = { ...node, ...(node.mesh === undefined ? {} : { mesh: node.mesh + template.meshBase }) };
    delete created.children;
    const at = out.nodes.push(created) - 1;
    if (node.children) {
      out.nodes[at].children = node.children.map(copy);
    }
    return at;
  };
  const parent = out.nodes.push({ name: path.split('/').pop(), translation, rotation, scale, children: [] }) - 1;
  out.nodes[parent].children = template.roots.map(copy);
  out.scenes[0].nodes.push(parent);
}

function compose(assets) {
  for (let q = -3; q <= 3; q++) {
    for (let r = Math.max(-3, -q - 3); r <= Math.min(3, -q + 3); r++) {
      const [x, z] = hex(q, r);
      place(assets, 'tiles/base/hex_grass', { translation: [x, 0, z] });
      for (const item of TILES[`${String(q)},${String(r)}`] ?? []) {
        place(assets, item.asset, { translation: [x, 0, z], rotation: yaw(item.rot) });
      }
    }
  }
  for (const [asset, q, r, dx, dz, rot] of PROPS) {
    const [x, z] = hex(q, r);
    place(assets, asset, { translation: [x + dx, 0, z + dz], rotation: yaw(rot), scale: [0.8, 0.8, 0.8] });
  }
  // Las rocas cuelgan desde la cara de abajo de los hexágonos (y = −1).
  for (const [asset, x, z, size, rot] of ROCKS) {
    const half = (rot * DEG) / 2;
    // 180° en x y luego `rot` en y: q = (0, sin, 0, cos)·(1, 0, 0, 0).
    const rotation = [Math.cos(half), 0, -Math.sin(half), 0];
    place(assets, asset, { translation: [x, -0.95, z], rotation, scale: [size, size, size] });
  }
  for (const [asset, x, y, z, size] of CLOUDS) {
    place(assets, asset, { translation: [x, y, z], scale: [size, size, size] });
  }
}

function gltfTransform(...args) {
  execFileSync('pnpm', ['dlx', GLTF_TRANSFORM, ...args], { stdio: 'inherit' });
}

const work = mkdtempSync(join(tmpdir(), 'isla-medieval-'));
try {
  const archive = join(work, 'pack.tar.gz');
  execFileSync('curl', ['-sSfL', '-o', archive, PACK_URL]);
  const sha = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (sha !== PACK_SHA256) {
    throw new Error(`sha256 del pack inesperado: ${sha}`);
  }
  execFileSync('tar', ['-xzf', archive, '-C', work]);
  const root = readdirSync(work).find((name) => name.startsWith('KayKit-Medieval-Hexagon-Pack'));
  const assets = join(work, root, 'addons', 'kaykit_medieval_hexagon_pack', 'Assets', 'gltf');

  compose(assets);
  out.buffers[0] = { byteLength: binLength, uri: 'composed.bin' };
  writeFileSync(join(work, 'composed.bin'), Buffer.concat(binChunks));
  // Las imágenes apuntan al pack (rutas absolutas): se pasan a relativas copiando el PNG.
  const png = out.images[0].uri;
  writeFileSync(join(work, 'hexagons_medieval.png'), readFileSync(png));
  for (const image of out.images) {
    image.uri = 'hexagons_medieval.png';
  }
  writeFileSync(join(work, 'composed.gltf'), JSON.stringify(out));

  gltfTransform('dedup', join(work, 'composed.gltf'), join(work, 'dedup.glb'));
  gltfTransform('prune', join(work, 'dedup.glb'), join(work, 'pruned.glb'));

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  gltfTransform('copy', join(work, 'pruned.glb'), join(OUT_DIR, OUT_FILE));
  gltfTransform('validate', join(OUT_DIR, OUT_FILE));
} finally {
  rmSync(work, { recursive: true, force: true });
}
