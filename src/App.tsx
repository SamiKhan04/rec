import { useState, useEffect, useRef } from 'react'
import './App.css'
import { TRACER_PY } from './tracerPrelude'

function App() {
  const [code, setCode] = useState("");
  const [call, setCall] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [treeOutput, setTreeOutput] = useState("");
  const [pyodideReady, setPyodideReady] = useState(false);
  const pyodideRef = useRef<any>(null);

  // Load Pyodide on mount
  useEffect(() => {
    async function loadPyodide() {
      // @ts-ignore
      const pyodide = await window.loadPyodide({indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.0/full/"});
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

  // Auto-grow textarea height
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(e.currentTarget.value);
    e.currentTarget.style.height = 'auto';
    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
  };

  const handleRunClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setOutput("");
    setTreeOutput("");
    setShowDropdown(false);
    if (!pyodideReady || !pyodideRef.current) {
      setError("Pyodide is still loading. Please wait.");
      setTimeout(() => setError(""), 2000);
      return;
    }
    try {
      // Combine code and call
      if (!code.trim() || !call.trim()) {
        setCode(`@trace(tree)
def fib(n):
  if n == 0 or n == 1:
      return n
  return fib(n-1) + fib(n-2)`);
        setCall("fib(5)");
        return;
      }
      const fullCode = `${TRACER_PY}\n\n${code}\n\nresult = ${call}\nfrom io import StringIO\nfrom contextlib import redirect_stdout\n_buffer = StringIO()\nif tree:\n    with redirect_stdout(_buffer):\n        print_ascii_tree(tree)\n    call_tree_output = _buffer.getvalue()\nelse:\n    call_tree_output = "No traced calls"`;
      await pyodideRef.current.runPythonAsync(fullCode);
      const pyGlobals = pyodideRef.current.globals;
      const resultProxy = pyGlobals.get('result');
      const treeProxy = pyGlobals.get('call_tree_output');
      const resultStr = resultProxy !== undefined ? resultProxy.toString() : "No output";
      const treeStr = treeProxy !== undefined ? treeProxy.toString() : "";
      setOutput(resultStr);
      setTreeOutput(treeStr ? treeStr.trimEnd() : "");
      if (resultProxy && typeof resultProxy.destroy === 'function') {
        resultProxy.destroy();
      }
      if (treeProxy && typeof treeProxy.destroy === 'function') {
        treeProxy.destroy();
      }
      setShowDropdown(true);
      setError("");
    } catch (err: any) {
      setError("Python error: " + err.message);
      setOutput("");
      setTreeOutput("");
      setShowDropdown(false);
    }
    setTimeout(() => {
      (e.currentTarget as HTMLButtonElement).blur();
    }, 1000);
  };

  return (
    <div className="app-layout">
      <div className="input-box">
        <textarea
          className="code-input"
          placeholder="@trace(tree)
def fib(n):
  if (n == 0 or n == 1):
      return n
  return fib(n-1) + fib(n-2)"
          value={code}
          onInput={e => handleInput(e, setCode)}
        />
        <textarea
          className="call-input"
          placeholder="fib(5)"
          value={call}
          onInput={e => handleInput(e, setCall)}
        />
        <button onClick={handleRunClick}>Run</button>
        {error && <div style={{color: 'red', marginTop: '10px'}}>{error}</div>}
        {showDropdown && (
          <div style={{
            position: 'absolute',
            top: '110%',
            left: 10,
            background: '#000000ff',
            border: '1px solid #ccc',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '18px 20px',
            minWidth: '220px',
            zIndex: 1000
          }}>
            <div style={{marginBottom: '12px', wordBreak: 'break-word'}}><b>Output:</b> {output}</div>
            <button
              style={{marginRight: '10px'}}
              onClick={() => {
                navigator.clipboard.writeText(output);}}>Copy</button>
            <button
              onClick={() => setShowDropdown(false)}>Close</button>
          </div>
        )}
      </div>
      <div className="tree-box">
        <h2>Call tree</h2>
        <pre>
          {treeOutput ? treeOutput : 'Run your traced function to see the call tree here.'}
        </pre>
      </div>
    </div>
  );
}

export default App
