'use client';

// Monaco wrapper, loaded client-only (the importing module uses next/dynamic ssr:false).
// Theme syncs to data-theme; minimap off, line numbers on, 13px mono, bg matches --code-bg.
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

import { useUiStore } from '@/stores/uiStore';

interface MonacoEditorProps {
  value: string;
  language?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  height?: string | number;
}

export default function MonacoEditor({ value, language = 'json', readOnly = false, onChange, height = '100%' }: MonacoEditorProps) {
  const theme = useUiStore((st) => st.theme);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const [mounted, setMounted] = useState(false);

  const defineThemes = (monaco: Parameters<OnMount>[1]) => {
    monaco.editor.defineTheme('postman-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#1e1e1e' },
    });
    monaco.editor.defineTheme('postman-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#ffffff' },
    });
  };

  const handleMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco;
    defineThemes(monaco);
    monaco.editor.setTheme(theme === 'dark' ? 'postman-dark' : 'postman-light');
    setMounted(true);
  };

  useEffect(() => {
    if (mounted && monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'dark' ? 'postman-dark' : 'postman-light');
    }
  }, [theme, mounted]);

  return (
    <Editor
      height={height}
      language={language}
      value={value}
      onChange={(v) => onChange?.(v ?? '')}
      onMount={handleMount}
      theme={theme === 'dark' ? 'postman-dark' : 'postman-light'}
      options={{
        readOnly,
        minimap: { enabled: false },
        lineNumbers: 'on',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: "'SF Mono', Menlo, Monaco, Consolas, monospace",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        renderLineHighlight: readOnly ? 'none' : 'line',
        folding: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
