import { ChangeEvent, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './App.css';
import { TRACER_PY } from './tracerPrelude';

type TraceNode = {
  id: number;
  parent: number | null;
  functionName: string;
  args: string[];
  kwargs: Record<string, string>;
  result: string;
};

type PositionedNode = TraceNode & {
  depth: number;
  x: number;
  y: number;
  z: number;
};

type LayoutResult = {
  nodes: PositionedNode[];
  edges: Array<{ from: number; to: number }>;
};

type LabelResources = {
  sprite: { position: { set: (x: number, y: number, z: number) => void } };
  material: { dispose: () => void };
  texture: { dispose: () => void };
};

function computeTreeLayout(nodes: TraceNode[]): LayoutResult {
  const positioned = new Map<number, PositionedNode>();
  const childMap = new Map<number, number[]>();

  nodes.forEach((node) => {
    positioned.set(node.id, { ...node, depth: 0, x: 0, y: 0, z: 0 });
    if (node.parent !== null) {
      const siblings = childMap.get(node.parent) ?? [];
      siblings.push(node.id);
      childMap.set(node.parent, siblings);
    }
  });

  const assignDepth = (id: number, depth: number) => {
    const node = positioned.get(id);
    if (!node) {
      return;
    }
    node.depth = depth;
    visited.add(id);
    const children = childMap.get(id) ?? [];
    children.forEach((childId) => assignDepth(childId, depth + 1));
  };

  const visited = new Set<number>();
  positioned.forEach((node) => {
    if (node.parent === null) {
      assignDepth(node.id, 0);
    }
  });

  positioned.forEach((node) => {
    if (!visited.has(node.id)) {
      assignDepth(node.id, 0);
    }
  });

  const levels = new Map<number, PositionedNode[]>();
  positioned.forEach((node) => {
    const list = levels.get(node.depth) ?? [];
    list.push(node);
    levels.set(node.depth, list);
  });

  const horizontalSpacing = 9;
  const verticalSpacing = 7;
  const depthSpacing = 2.8;

  levels.forEach((levelNodes, depth) => {
    levelNodes.sort((a, b) => a.id - b.id);
    const count = levelNodes.length;
    const xOffset = (count - 1) * horizontalSpacing * 0.5;
    const zOffset = (count - 1) * depthSpacing * 0.5;
    levelNodes.forEach((node, index) => {
      node.x = index * horizontalSpacing - xOffset;
      node.y = -depth * verticalSpacing;
      node.z = index * depthSpacing - zOffset + depth * 0.6;
    });
  });

  const edges: Array<{ from: number; to: number }> = [];
  positioned.forEach((node) => {
    if (node.parent !== null && positioned.has(node.parent)) {
      edges.push({ from: node.parent, to: node.id });
    }
  });

  return { nodes: Array.from(positioned.values()), edges };
}

function createLabelSprite(text: string): LabelResources | null {
  const fontSize = 42;
  const padding = 56;
  const measuringCanvas = document.createElement('canvas');
  const measuringContext = measuringCanvas.getContext('2d');
  if (!measuringContext) {
    return null;
  }
  const fontDeclaration = `${fontSize}px 'Inter', 'Segoe UI', sans-serif`;
  measuringContext.font = fontDeclaration;
  const metrics = measuringContext.measureText(text);
  const width = Math.ceil(metrics.width + padding);
  const height = Math.ceil(fontSize * 1.8);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.font = fontDeclaration;
  context.fillStyle = 'rgba(15, 23, 42, 0.82)';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#f8fafc';
  context.textBaseline = 'middle';
  context.fillText(text, padding / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scaleFactor = 0.06;
  sprite.scale.set(width * scaleFactor, height * scaleFactor, 1);
  sprite.center.set(0.5, 0);
  return { sprite, material, texture };
}

const DEFAULT_CODE = `@trace
def fib(n):
    if n in (0, 1):
        return n
    return fib(n - 1) + fib(n - 2)`;

const DEFAULT_CALL = 'fib(5)';

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [callExpression, setCallExpression] = useState(DEFAULT_CALL);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [stdout, setStdout] = useState('');
  const [treeOutput, setTreeOutput] = useState('');
  const [graphData, setGraphData] = useState<TraceNode[] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const pyodideRef = useRef<any>(null);
  const codeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const callInputRef = useRef<HTMLTextAreaElement | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadPyodide() {
      // @ts-ignore
      const pyodide = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.0/full/' });
      pyodideRef.current = pyodide;
      setPyodideReady(true);
    }

    if (!(window as any).loadPyodide) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js';
      script.onload = loadPyodide;
      document.body.appendChild(script);
    } else {
      loadPyodide();
    }
  }, []);

  const adjustTextarea = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    adjustTextarea(codeInputRef.current);
    adjustTextarea(callInputRef.current);
  }, []);

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container) {
      return;
    }

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (!graphData || graphData.length === 0) {
      return;
    }

    const parentBounds = container.parentElement;
    const width = container.clientWidth || parentBounds?.clientWidth || 720;
    const height = container.clientHeight || parentBounds?.clientHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 2000);
    camera.position.set(0, 0, 60);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.maxDistance = 220;
    controls.minDistance = 12;

    const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.55);
    scene.add(ambientLight);
    const keyLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    keyLight.position.set(26, 34, 60);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x1d4ed8, 0.35);
    fillLight.position.set(-32, -28, -40);
    scene.add(fillLight);

    const layout = computeTreeLayout(graphData);
    const nodeLookup = new Map(layout.nodes.map((node) => [node.id, node]));

    const nodeGeometry = new THREE.SphereGeometry(1.4, 32, 32);
    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x1e3a8a,
      emissiveIntensity: 0.38,
      roughness: 0.45,
      metalness: 0.12,
    });
    const rootMaterial = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0x92400e,
      emissiveIntensity: 0.32,
      roughness: 0.4,
      metalness: 0.08,
    });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 1 });

    const labelsGroup = new THREE.Group();
    const nodesGroup = new THREE.Group();
    scene.add(nodesGroup);
    scene.add(labelsGroup);

    const labelResources: LabelResources[] = [];
    type DisposableLine = { geometry: { dispose: () => void } };
    const lines: DisposableLine[] = [];

    layout.nodes.forEach((node) => {
      const mesh = new THREE.Mesh(nodeGeometry, node.parent === null ? rootMaterial : nodeMaterial);
      mesh.position.set(node.x, node.y, node.z);
      nodesGroup.add(mesh);

      const kwPairs = Object.entries(node.kwargs).map(([key, value]) => `${key}=${value}`);
      const argParts = [...node.args, ...kwPairs].filter((part) => part.length > 0);
      const argsLabel = argParts.join(', ');
      const truncatedArgs = argsLabel.length > 42 ? `${argsLabel.slice(0, 39)}…` : argsLabel;
      const truncatedResult = node.result.length > 28 ? `${node.result.slice(0, 25)}…` : node.result;
      const labelText = `${node.functionName}(${truncatedArgs}) → ${truncatedResult}`;
      const label = createLabelSprite(labelText.trim());
      if (label) {
        label.sprite.position.set(node.x, node.y + 4.2, node.z);
        labelsGroup.add(label.sprite);
        labelResources.push(label);
      }
    });

    layout.edges.forEach(({ from, to }) => {
      const parentNode = nodeLookup.get(from);
      const childNode = nodeLookup.get(to);
      if (!parentNode || !childNode) {
        return;
      }
      const points = [
        new THREE.Vector3(parentNode.x, parentNode.y, parentNode.z),
        new THREE.Vector3(childNode.x, childNode.y, childNode.z),
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, edgeMaterial);
      scene.add(line);
      lines.push(line as DisposableLine);
    });

    const bounds = new THREE.Box3().setFromObject(nodesGroup);
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      camera.position.set(center.x + maxDimension * 1.2, center.y + maxDimension * 0.9, center.z + maxDimension * 2.4 + 20);
      controls.target.copy(center);
      controls.update();
    }

    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const newWidth = container.clientWidth || container.parentElement?.clientWidth || width;
      const newHeight = container.clientHeight || container.parentElement?.clientHeight || height;
      renderer.setSize(newWidth, newHeight, false);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      rootMaterial.dispose();
      edgeMaterial.dispose();
      lines.forEach((line) => {
        line.geometry.dispose();
      });
      labelResources.forEach((resource) => {
        resource.texture.dispose();
        resource.material.dispose();
      });
    };
  }, [graphData]);

  const handleCodeChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.currentTarget.value);
    adjustTextarea(e.currentTarget);
  };

  const handleCallChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setCallExpression(e.currentTarget.value);
    adjustTextarea(e.currentTarget);
  };

  const handleRunClick = async () => {
    setError('');
    setResult(null);
    setStdout('');
    setTreeOutput('');
    setGraphData(null);

    if (!pyodideReady || !pyodideRef.current) {
      setError('Pyodide is still loading. Please wait.');
      return;
    }

    if (!code.trim()) {
      setError('Please provide some Python code to run.');
      return;
    }

    const trimmedCall = callExpression.trim();
    if (!trimmedCall) {
      setError('Please provide a call expression to evaluate.');
      return;
    }

    const pythonLines = [
      TRACER_PY,
      '',
      code,
      '',
      'reset_trace()',
      '',
      'from io import StringIO',
      'from contextlib import redirect_stdout',
      '_stdout_capture = StringIO()',
      '_tree_capture = StringIO()',
      'call_tree_output = ""',
      'call_tree_json = "[]"',
      'user_stdout = ""',
      'try:',
      '    with redirect_stdout(_stdout_capture):',
      `        result = ${trimmedCall}`,
      'except Exception:',
      '    user_stdout = _stdout_capture.getvalue()',
      '    raise',
      'else:',
      '    user_stdout = _stdout_capture.getvalue()',
      '    if tree:',
      '        with redirect_stdout(_tree_capture):',
      '            print_ascii_tree(tree)',
      '        call_tree_output = _tree_capture.getvalue() or "No traced calls"',
      '        import json',
      '        payload = []',
      '        for nid, (parent, fn_name, args, kwargs, result) in tree.items():',
      '            payload.append({',
      '                "id": nid,',
      '                "parent": parent,',
      '                "functionName": fn_name,',
      '                "args": [repr(arg) for arg in args],',
      '                "kwargs": {str(key): repr(value) for key, value in kwargs.items()},',
      '                "result": repr(result)',
      '            })',
      '        call_tree_json = json.dumps(payload)',
      '    else:',
      '        call_tree_output = "No traced calls"',
    ];
    const fullCode = pythonLines.join('\n');

    setIsRunning(true);
    try {
      await pyodideRef.current.runPythonAsync(fullCode);
      const pyGlobals = pyodideRef.current.globals;
      const resultProxy = pyGlobals.get('result');
      const stdoutProxy = pyGlobals.get('user_stdout');
      const treeProxy = pyGlobals.get('call_tree_output');
      const treeJsonProxy = pyGlobals.get('call_tree_json');

      const resultStr = resultProxy !== undefined ? resultProxy.toString() : 'No result';
      const stdoutStr = stdoutProxy !== undefined ? stdoutProxy.toString() : '';
      const treeStr = treeProxy !== undefined ? treeProxy.toString() : '';
      const treeJsonStr = treeJsonProxy !== undefined ? treeJsonProxy.toString() : '[]';

      let parsedGraph: TraceNode[] = [];
      try {
        const raw = JSON.parse(treeJsonStr) as unknown;
        if (Array.isArray(raw)) {
          parsedGraph = raw.flatMap((item) => {
            if (typeof item !== 'object' || item === null) {
              return [];
            }
            const record = item as Record<string, unknown>;
            const id = Number(record.id);
            if (!Number.isFinite(id)) {
              return [];
            }
            const parentValue = record.parent;
            const parent = parentValue === null || parentValue === undefined ? null : Number(parentValue);
            if (parent !== null && !Number.isFinite(parent)) {
              return [];
            }
            const functionName = typeof record.functionName === 'string' ? record.functionName : 'fn';
            const argsValue = Array.isArray(record.args) ? record.args : [];
            const kwargsValue = typeof record.kwargs === 'object' && record.kwargs !== null ? (record.kwargs as Record<string, unknown>) : {};
            const resultValue = 'result' in record ? record.result : '';
            const formattedKwargs = Object.fromEntries(
              Object.entries(kwargsValue).map(([key, value]) => [key, String(value)])
            );
            return [
              {
                id,
                parent,
                functionName,
                args: argsValue.map((arg) => String(arg)),
                kwargs: formattedKwargs,
                result: String(resultValue),
              } satisfies TraceNode,
            ];
          });
        }
      } catch (jsonError) {
        console.warn('Unable to parse trace JSON', jsonError);
      }

      setResult(resultStr);
      setStdout(stdoutStr.trimEnd());
      setTreeOutput(treeStr ? treeStr.trimEnd() : '');
      setGraphData(parsedGraph.length > 0 ? parsedGraph : null);

      [resultProxy, stdoutProxy, treeProxy, treeJsonProxy].forEach((proxy) => {
        if (proxy && typeof proxy.destroy === 'function') {
          proxy.destroy();
        }
      });
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : String(err);
      setError(`Python error: ${message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="app-layout">
      <div className="input-box">
        <label htmlFor="code-input">Python code</label>
        <textarea
          id="code-input"
          ref={codeInputRef}
          className="code-input"
          placeholder="@trace\ndef fib(n):\n    if n in (0, 1):\n        return n\n    return fib(n - 1) + fib(n - 2)"
          value={code}
          onChange={handleCodeChange}
        />
        <label htmlFor="call-input">Call expression</label>
        <textarea
          id="call-input"
          ref={callInputRef}
          className="call-input"
          placeholder="fib(5)"
          value={callExpression}
          onChange={handleCallChange}
        />
        <p className="helper-text">
          Decorate functions with <code>@trace</code> (or <code>@trace(tree)</code>) before running the call below.
          For memoization, type <code>from functools import cache</code> and place <code>@cache</code> above the <code>@trace</code> decorator.
        </p>
        <div className="controls">
          <button onClick={handleRunClick} disabled={!pyodideReady || isRunning}>
            {!pyodideReady ? 'Loading Pyodide…' : isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
      </div>

      <div className="results-grid">
        <div className="panel">
          <h2>Return value</h2>
          <div className="panel-body">
            {result !== null ? result : 'Run your call expression to see the return value here.'}
          </div>
        </div>
        <div className="panel">
          <h2>Stdout</h2>
          <div className="panel-body">
            {stdout ? stdout : 'Any printed output will appear here.'}
          </div>
        </div>
      </div>

      <div className="tree-box">
        <h2>Call visualization</h2>
        <div className="tree-visual">
          <div className="tree-canvas">
            <div className="tree-canvas-mount" ref={graphContainerRef} />
            {!graphData && (
              <div className="tree-canvas-placeholder">
                Run your traced function to generate the 3D recursion graph.
              </div>
            )}
            {graphData && (
              <div className="tree-canvas-overlay">Drag to orbit · Scroll to zoom</div>
            )}
          </div>
          <div className="tree-ascii">
            <h3>ASCII trace</h3>
            <pre>{treeOutput || 'Run your traced function to see the call tree here.'}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
