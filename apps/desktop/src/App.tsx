import React, { useState, useEffect } from 'react';

export default function App() {
  const [version, setVersion] = useState<string>('Loading...');

  useEffect(() => {
    // Check if electron API is available
    if (window.electronAPI) {
      window.electronAPI.getAppVersion().then(setVersion).catch(console.error);
    } else {
      setVersion('Web Mode');
    }
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
          AIVA Desktop
        </h1>
        <p className="text-zinc-400">Personal AI Operating System</p>
        <div className="mt-8 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <p className="text-sm font-mono text-zinc-300">Version: {version}</p>
          <p className="text-xs text-zinc-500 mt-2">Renderer Active</p>
        </div>
      </div>
    </div>
  );
}
