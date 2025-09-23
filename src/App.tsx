import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [code, setCode] = useState("");
  const [call, setCall] = useState("");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
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
    setShowDropdown(false);
    if (!pyodideReady || !pyodideRef.current) {
      setError("Pyodide is still loading. Please wait.");
      setTimeout(() => setError(""), 2000);
      return;
    }
    try {
      // Combine code and call
      if (!code.trim() || !call.trim()) {
        setCode(`def fib(n):
  if n == 0 or n == 1:
      return n
  return fib(n-1) + fib(n-2)`);
        setCall("fib(5)");
        return;
      }
      const fullCode = `${code}\nresult = ${call}`;
      await pyodideRef.current.runPythonAsync(fullCode);
      const result = pyodideRef.current.globals.get('result');
      const resultStr = result !== undefined ? String(result) : "No output";
      setOutput(resultStr);
      setShowDropdown(true);
      setError("");
    } catch (err: any) {
      setError("Python error: " + err.message);
      setOutput("");
      setShowDropdown(false);
    }
    setTimeout(() => {
      (e.currentTarget as HTMLButtonElement).blur();
    }, 1000);
  };

  return (
    <>
      <div className="input-box"> 
        <textarea
          className="code-input"
          placeholder="def fib(n):
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
    </>
  );
}

export default App
