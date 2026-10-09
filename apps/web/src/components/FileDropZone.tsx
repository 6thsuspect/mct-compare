import { useRef, useState } from "react";

export interface PickedFile {
  name: string;
  text: string;
}

export default function FileDropZone(props: {
  label: string;
  file: PickedFile | null;
  onPick: (file: PickedFile) => void;
  onClear: () => void;
  accent: "blue" | "amber";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = (f: File): void => {
    if (f.size > 25 * 1024 * 1024) {
      setError("File exceeds the 25 MB safety limit.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      props.onPick({ name: f.name, text: String(reader.result ?? "") });
    };
    reader.onerror = () => setError("Could not read the file.");
    reader.readAsText(f);
  };

  const border = props.accent === "blue" ? "border-blue-300" : "border-amber-300";
  const active = props.accent === "blue" ? "border-blue-500 bg-blue-50" : "border-amber-500 bg-amber-50";

  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") input.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) read(f);
        }}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors ${
          dragging ? active : `${border} bg-white hover:bg-slate-50`
        }`}
      >
        {props.file ? (
          <div>
            <div className="truncate font-mono text-sm font-semibold text-slate-800">
              {props.file.name}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {(props.file.text.length / 1024).toFixed(1)} KB ·{" "}
              {props.file.text.split("\n").length.toLocaleString()} lines · click to
              replace
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-medium text-slate-600">
              Drop an .mct file here, or click to browse
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Files stay in your browser; nothing is uploaded.
            </div>
            {typeof window !== "undefined" && window.mctDesktop && (
              <button
                className="mt-2 rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-100"
                onClick={(e) => {
                  e.stopPropagation();
                  window.mctDesktop!.openFile().then((r) => {
                    if (r) props.onPick({ name: r.name, text: r.text });
                  });
                }}
              >
                Open via file dialog…
              </button>
            )}
          </div>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".mct,.txt,.civ,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) read(f);
          e.target.value = "";
        }}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-red-600">{error ?? ""}</span>
        {props.file && (
          <button
            className="text-xs text-slate-500 underline hover:text-slate-700"
            onClick={props.onClear}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
