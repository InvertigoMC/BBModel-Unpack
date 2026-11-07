/**
 * JavaScript source evaluated in the Blockbench page via Runtime.evaluate.
 * Kept as plain string builders (the page context has its own THREE, Codecs, etc.).
 */

export interface ProbeScriptParams {
	readyTimeoutMs: number;
}

/** Returns { ready: boolean, detail: string } once the page exposes the APIs we need. */
export function buildProbeScript(params: ProbeScriptParams): string {
	return `(async () => {
		const deadline = Date.now() + ${params.readyTimeoutMs};
		while (Date.now() < deadline) {
			// Note: Project (the current project instance) may not exist on a fresh boot;
			// requiring it here would spin until the deadline, so only check boot-level APIs.
			if (typeof Codecs !== 'undefined'
				&& typeof THREE !== 'undefined'
				&& typeof Canvas !== 'undefined'
				&& Canvas.scene) {
				return { ready: true, detail: 'blockbench apis present' };
			}
			await new Promise(r => setTimeout(r, 250));
		}
		return { ready: false, detail: 'Blockbench APIs did not become available' };
	})()`;
}

export function buildLoadScript(jsonContent: string, fakePath: string): string {
	return `(async () => {
		try {
			const model = JSON.parse(${JSON.stringify(jsonContent)});
			if (!model || !model.meta) return { ok: false, error: 'not a bbmodel (missing meta)' };
			Codecs.project.load(model, { path: ${JSON.stringify(fakePath)}, no_file: true });
			// let textures and meshes settle
			await new Promise(r => setTimeout(r, 200));
			return {
				ok: true,
				elements: Project.elements ? Project.elements.length : 0,
				textures: Project.textures ? Project.textures.length : 0,
				format: Project.format ? Project.format.id : undefined,
				name: Project.name
			};
		} catch (err) {
			return { ok: false, error: String(err && err.message ? err.message : err) };
		}
	})()`;
}

/**
 * Measure the world-space bounding box of visible element meshes.
 * Walks each element mesh's ancestors so rotated groups/bones are included via THREE.
 */
export const BUILD_BBOX_SCRIPT = `(async () => {
	try {
		if (!Project.elements || !Project.elements.length) {
			return { ok: false, error: 'model has no elements' };
		}
		const keep = new Set();
		const box = new THREE.Box3();
		const localCorners = [
			[0,0,0],[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1]
		];
		const corner = new THREE.Vector3();
		for (const e of Project.elements) {
			// Locators, null objects etc. may have a mesh without geometry
			if (!e.mesh || !e.mesh.geometry) continue;
			e.mesh.updateMatrixWorld(true);
			// Use ONLY the element's own geometry bounds: expanding the mesh object
			// would include Blockbench's outline/selection children which are inflated (~1.4x wider),
			// over-widening the framing box.
			const geom = e.mesh.geometry;
			geom.computeBoundingBox();
			const gb = geom.boundingBox;
			if (gb && !gb.isEmpty()) {
				for (const c of localCorners) {
					corner.set(
						c[0] ? gb.max.x : gb.min.x,
						c[1] ? gb.max.y : gb.min.y,
						c[2] ? gb.max.z : gb.min.z
					).applyMatrix4(e.mesh.matrixWorld);
					box.expandByPoint(corner);
				}
			}
			let n = e.mesh;
			while (n.parent && n.parent !== Canvas.scene) {
				keep.add(n);
				n = n.parent;
			}
			keep.add(n);
		}
		if (box.isEmpty()) return { ok: false, error: 'no visible geometry found (empty bbox)' };
		return { ok: true, min: box.min.toArray(), max: box.max.toArray(), keepSize: keep.size };
	} catch (err) {
		return { ok: false, error: String(err && err.message ? err.message : err) };
	}
})()`;

export interface RenderScriptParams {
	fit: {
		position: [number, number, number];
		target: [number, number, number];
		left: number; right: number; top: number; bottom: number;
		near: number; far: number;
	};
	width: number;
	height: number;
	transparent: boolean;
}

/**
 * Hide everything not reachable from element meshes (grid, outlines, gizmos),
 * keep lights, render with an orthographic camera built from the Node-side fit,
 * and return a base64 data URL.
 */
export function buildRenderScript(params: RenderScriptParams): string {
	const fitJson = JSON.stringify(params.fit);
	return `(async () => {
		try {
			const fit = ${fitJson};
			const hidden = [];
			const kept = new Set();

			// node = topmost scene-level ancestor of each element mesh
			const roots = new Set();
			for (const e of Project.elements) {
				if (!e.mesh) continue;
				let n = e.mesh;
				while (n.parent && n.parent !== Canvas.scene) n = n.parent;
				roots.add(n);
			}
			for (const c of Canvas.scene.children) {
				if (roots.has(c) || c.name === 'lights') continue;
				if (c.visible) { hidden.push(c); c.visible = false; }
			}

			const camera = new THREE.OrthographicCamera(
				fit.left, fit.right, fit.top, fit.bottom, fit.near, fit.far
			);
			camera.position.set(fit.position[0], fit.position[1], fit.position[2]);
			camera.lookAt(fit.target[0], fit.target[1], fit.target[2]);
			camera.updateProjectionMatrix();

			const renderer = new THREE.WebGLRenderer({
				antialias: true,
				alpha: ${params.transparent ? 'true' : 'false'},
				preserveDrawingBuffer: true
			});
			renderer.setSize(${params.width}, ${params.height});
			renderer.setClearColor(0x000000, ${params.transparent ? '0' : '1'});

			try {
				Canvas.scene.updateMatrixWorld(true);
				renderer.render(Canvas.scene, camera);
				const url = renderer.domElement.toDataURL('image/png');
				return { ok: true, dataUrl: url, hiddenCount: hidden.length };
			} finally {
				renderer.dispose();
				renderer.forceContextLoss?.();
				for (const c of hidden) c.visible = true;
			}
		} catch (err) {
			return { ok: false, error: String(err && err.message ? err.message : err) };
		}
	})()`;
}
