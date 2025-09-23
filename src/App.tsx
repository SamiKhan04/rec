import { ChangeEvent, useEffect, useRef, useState } from 'react';
import './App.css';
import { TRACER_PY } from './tracerPrelude';

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
  const [isRunning, setIsRunning] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const pyodideRef = useRef<any>(null);
  const codeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const callInputRef = useRef<HTMLTextAreaElement | null>(null);

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

      const resultStr = resultProxy !== undefined ? resultProxy.toString() : 'No result';
      const stdoutStr = stdoutProxy !== undefined ? stdoutProxy.toString() : '';
      const treeStr = treeProxy !== undefined ? treeProxy.toString() : '';

      setResult(resultStr);
      setStdout(stdoutStr.trimEnd());
      setTreeOutput(treeStr ? treeStr.trimEnd() : '');

      [resultProxy, stdoutProxy, treeProxy].forEach((proxy) => {
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
        <h2>Call tree</h2>
        <pre>{treeOutput || 'Run your traced function to see the call tree here.'}</pre>
      </div>
    </div>
  );
}

export default App;
