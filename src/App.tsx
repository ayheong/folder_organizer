import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { basename, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir, size } from "@tauri-apps/plugin-fs";
import "./App.css";

type TreeNode = {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
  children?: TreeNode[]
}

const ROOT_TREE_KEY = "__root__";
const SCAN_TYPING_LINE = "Scanning folder…";

type FolderScanProgress = {
  onFile: () => void;
};

type ChangePreview = { id: string; from: string; to: string };

const PLACEHOLDER_RENAME: ChangePreview[] = [
  { id: "r1", from: "misc_exports.pdf", to: "taxes_2025.pdf" },
  { id: "r2", from: "IMG_0001.JPG", to: "vacation_photo_01.jpg" },
  { id: "r3", from: "notes.txt", to: "readme.txt" },
];

const PLACEHOLDER_MOVE: ChangePreview[] = [
  { id: "m1", from: "drafts/chapter1.md", to: "manuscript/chapter1.md" },
  { id: "m2", from: "Desktop/screenshot.png", to: "assets/screenshots/window_layout.png" },
];

const PLACEHOLDER_DELETE: ChangePreview[] = [
  { id: "d1", from: "old_backup.zip", to: "(remove)" },
  { id: "d2", from: "temp/cache.bin", to: "(remove)" },
];

function format_byte_size(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

function count_tree_nodes(nodes: TreeNode[]): { files: number; dirs: number } {
  let files = 0;
  let dirs = 0;
  for (const node of nodes) {
    if (node.isDirectory) {
      dirs += 1;
      if (node.children?.length) {
        const inner = count_tree_nodes(node.children);
        files += inner.files;
        dirs += inner.dirs;
      }
    } else {
      files += 1;
    }
  }
  return { files, dirs };
}

function collect_collapsed_directory_keys(
  nodes: TreeNode[],
  path_prefix: string,
  into: Set<string>,
) {
  nodes.forEach((node, index) => {
    const key = `${path_prefix}:${index}:${node.name}`;
    const has_children =
      node.isDirectory && node.children !== undefined && node.children.length > 0;
    if (has_children) {
      into.add(key);
      collect_collapsed_directory_keys(node.children!, `${key}/`, into);
    }
  });
}

function App() {
  const [selectedFolder, setSelectedFolder] = useState("");
  const [folderContents, setFolderContents] = useState<TreeNode[]>([]);
  const [rootTreeLabel, setRootTreeLabel] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set<string>());
  const [isScanningFolder, setIsScanningFolder] = useState(false);
  const [scanLineTyped, setScanLineTyped] = useState("");
  const [filesFoundCount, setFilesFoundCount] = useState(0);
  const [folderTotalBytes, setFolderTotalBytes] = useState<number | null>(null);
  const [ignorePatterns, setIgnorePatterns] = useState("");

  useEffect(() => {
    if (!isScanningFolder) {
      setScanLineTyped("");
      return;
    }
    setScanLineTyped("");
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setScanLineTyped(SCAN_TYPING_LINE.slice(0, i));
      if (i >= SCAN_TYPING_LINE.length) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [isScanningFolder]);

  async function open_folder_selector_dialog() {
    const folder = await open({
      multiple: false,
      directory: true,
    });
    if (folder) {
      const path = folder as string;
      setSelectedFolder(path);
      setFolderContents([]);
      setRootTreeLabel("");
      setCollapsedKeys(new Set());
      setFilesFoundCount(0);
      setFolderTotalBytes(null);
      setIsScanningFolder(true);

      let file_count = 0;
      let raf_flush: number = 0;
      const bump_file = () => {
        file_count += 1;
        if (raf_flush !== 0) return;
        raf_flush = window.requestAnimationFrame(() => {
          raf_flush = 0;
          setFilesFoundCount(file_count);
        });
      };

      try {
        const label = await basename(path);
        setRootTreeLabel(label);
        const tree = await read_folder_contents(path, { onFile: bump_file });
        if (raf_flush !== 0) {
          window.cancelAnimationFrame(raf_flush);
          raf_flush = 0;
        }
        setFilesFoundCount(file_count);
        console.log(tree);
        const initially_collapsed = new Set<string>();
        collect_collapsed_directory_keys(tree, "", initially_collapsed);
        setCollapsedKeys(initially_collapsed);
        setFolderContents(tree);
        try {
          const bytes = await size(path);
          setFolderTotalBytes(bytes);
        } catch {
          setFolderTotalBytes(null);
        }
      } finally {
        setIsScanningFolder(false);
      }
    }
  }

  async function read_folder_contents(
    path: string,
    progress?: FolderScanProgress,
  ): Promise<TreeNode[]> {
    const entries = await readDir(path);
    const tree: TreeNode[] = [];
    for (const entry of entries) {
      if (entry.isDirectory && !entry.isSymlink) {
        const childPath = await join(path, entry.name);
        tree.push({
          name: entry.name,
          isDirectory: true,
          isFile: false,
          isSymlink: false,
          children: await read_folder_contents(childPath, progress),
        });
      } else {
        progress?.onFile();
        tree.push({
          name: entry.name,
          isDirectory: entry.isDirectory,
          isFile: entry.isFile,
          isSymlink: entry.isSymlink,
        });
      }
    }
    return tree;
  }

  function toggle_tree_node(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function is_tree_node_expanded(key: string) {
    return !collapsedKeys.has(key);
  }

  function render_tree_lines(
    nodes: TreeNode[],
    ancestor_prefix: string,
    path_prefix: string,
  ): ReactNode {
    return nodes.map((node, index) => {
      const is_last = index === nodes.length - 1;
      const branch = is_last ? "└── " : "├── ";
      const child_ancestor = ancestor_prefix + (is_last ? "    " : "│   ");
      const key = `${path_prefix}:${index}:${node.name}`;
      const has_children =
        node.isDirectory && node.children !== undefined && node.children.length > 0;
      const expanded = is_tree_node_expanded(key);

      const toggle_column = has_children ? (
        <button
          type="button"
          className="terminal-tree-line__toggle"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} folder ${node.name}`}
          onClick={() => toggle_tree_node(key)}
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="terminal-tree-line__toggle-spacer" aria-hidden />
      );

      return (
        <Fragment key={key}>
          <div className="terminal-tree-line">
            <span className="terminal-tree-line__glyphs">
              {ancestor_prefix}
              {branch}
            </span>
            {toggle_column}
            <span
              className={
                node.isDirectory
                  ? "terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
                  : "terminal-tree-line__icon ti ti-file terminal-tree-line__icon--file"
              }
              aria-hidden
            />
            <span
              className={
                node.isDirectory
                  ? "terminal-tree-line__name terminal-tree-line__name--dir"
                  : "terminal-tree-line__name terminal-tree-line__name--file"
              }
            >
              {node.isDirectory ? `${node.name}/` : node.name}
            </span>
          </div>
          {has_children && expanded
            ? render_tree_lines(node.children!, child_ancestor, `${key}/`)
            : null}
        </Fragment>
      );
    });
  }

  const root_has_children = rootTreeLabel !== "" && folderContents.length > 0;
  const root_expanded = rootTreeLabel !== "" && is_tree_node_expanded(ROOT_TREE_KEY);

  const tree_stats = useMemo(() => count_tree_nodes(folderContents), [folderContents]);

  return (
    <div className="app-shell">
      <aside className="panel panel--controls panel-controls" aria-label="Folder actions">
        <header className="panel-terminal__titlebar panel-controls__titlebar">
          <span className="panel-terminal__title">
            <span className="panel-terminal__title-icon ti ti-layout-sidebar" aria-hidden />
            folder organizer
          </span>
        </header>
        <header className="panel-controls__header">
          <h1 className="panel-controls__app-title">Folder Organizer</h1>
          <h2 className="panel-controls__subtitle">AI-powered file organizer</h2>
        </header>

        <button
          type="button"
          className="panel-controls__select-btn"
          onClick={open_folder_selector_dialog}
          disabled={isScanningFolder}
        >
          <span className="panel-controls__select-icon ti ti-folder" aria-hidden />
          {isScanningFolder ? "Scanning…" : "Select Folder"}
        </button>

        <div
          className={
            selectedFolder
              ? "panel-controls__path-box"
              : "panel-controls__path-box panel-controls__path-box--empty"
          }
        >
          {selectedFolder ? (
            <span className="panel-controls__path-text">{selectedFolder}</span>
          ) : (
            <span className="panel-controls__path-placeholder">No folder selected</span>
          )}
        </div>

        <div className="panel-controls__pills" aria-label="Folder statistics">
          <div className="panel-controls__pill">
            <span className="panel-controls__pill-label">Files</span>
            <span className="panel-controls__pill-value">
              {selectedFolder && rootTreeLabel && !isScanningFolder ? tree_stats.files : 0}
            </span>
          </div>
          <div className="panel-controls__pill">
            <span className="panel-controls__pill-label">Folders</span>
            <span className="panel-controls__pill-value">
              {selectedFolder && rootTreeLabel && !isScanningFolder ? tree_stats.dirs : 0}
            </span>
          </div>
          <div className="panel-controls__pill">
            <span className="panel-controls__pill-label">Total size</span>
            <span className="panel-controls__pill-value" title={folderTotalBytes != null ? `${folderTotalBytes} bytes` : undefined}>
              {selectedFolder && rootTreeLabel && !isScanningFolder
                ? folderTotalBytes != null
                  ? format_byte_size(folderTotalBytes)
                  : "—"
                : "—"}
            </span>
          </div>
        </div>

        <div className="panel-controls__fill" aria-hidden />

        <div className="panel-controls__ignore">
          <label className="panel-controls__ignore-label" htmlFor="ignore-patterns-input">
            Ignore patterns
          </label>
          <input
            id="ignore-patterns-input"
            type="text"
            className="panel-controls__ignore-input"
            placeholder="e.g. desktop.ini, .DS_Store"
            value={ignorePatterns}
            onChange={(e) => setIgnorePatterns(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="panel-controls__ignore-hint">
            Comma-separated names or globs. Matching files are skipped when planning changes.
          </p>
        </div>

        <footer className="panel-controls__footer">
          <button type="button" className="panel-controls__organize-btn">
            Propose changes
          </button>
        </footer>
      </aside>

      <section className="panel panel--terminal" aria-label="Folder tree output">
        <header className="panel-terminal__titlebar">
          <span className="panel-terminal__title">
            <span className="panel-terminal__title-icon ti ti-folder-open" aria-hidden />
            current tree{rootTreeLabel ? ` — ${rootTreeLabel}` : ""}
          </span>
        </header>
        <div className="panel-terminal__body">
          {isScanningFolder ? (
            <div className="panel-terminal__scan" aria-live="polite">
              <p className="panel-terminal__scan-line">
                <span className="terminal-tree-line__glyphs">$  </span>
                <span
                  className={
                    scanLineTyped.length >= SCAN_TYPING_LINE.length
                      ? "panel-terminal__scan-typed panel-terminal__scan-typed--done"
                      : "panel-terminal__scan-typed"
                  }
                >
                  {scanLineTyped}
                </span>
                {scanLineTyped.length < SCAN_TYPING_LINE.length && (
                  <span className="panel-terminal__scan-caret" aria-hidden>
                    █
                  </span>
                )}
              </p>
              <p className="panel-terminal__scan-counter">
                <span className="terminal-tree-line__glyphs">&gt; </span>
                <span className="panel-terminal__scan-counter-label">files found:</span>{" "}
                <span className="panel-terminal__scan-counter-value">{filesFoundCount}</span>
                <span className="panel-terminal__scan-dots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              </p>
            </div>
          ) : rootTreeLabel === "" ? (
            <p className="panel-terminal__placeholder">
              <span className="terminal-tree-line__glyphs">$ </span>
              <span className="panel-terminal__muted">Select a folder to list contents…</span>
            </p>
          ) : (
            <>
              <div className="terminal-tree-line terminal-tree-line--root">
                {root_has_children ? (
                  <button
                    type="button"
                    className="terminal-tree-line__toggle"
                    aria-expanded={root_expanded}
                    aria-label={`${root_expanded ? "Collapse" : "Expand"} folder ${rootTreeLabel}`}
                    onClick={() => toggle_tree_node(ROOT_TREE_KEY)}
                  >
                    {root_expanded ? "▾" : "▸"}
                  </button>
                ) : null}
                <span
                  className="terminal-tree-line__icon ti ti-folder terminal-tree-line__icon--dir"
                  aria-hidden
                />
                <span className="terminal-tree-line__name terminal-tree-line__name--dir">
                  {rootTreeLabel}/
                </span>
              </div>
              {root_has_children && root_expanded
                ? render_tree_lines(folderContents, "", "")
                : null}
            </>
          )}
          <span className="panel-terminal__cursor" aria-hidden>
            █
          </span>
        </div>
      </section>

      <section className="panel panel--changes" aria-label="Proposed changes">
        <header className="panel-terminal__titlebar">
          <span className="panel-terminal__title">
            <span className="panel-terminal__title-icon ti ti-wand" aria-hidden />
            proposed changes
          </span>
        </header>
        <div className="panel-changes__frame">
          <div className="panel-changes__scroll">
            <div className="panel-changes__section">
              <h2 className="panel-changes__heading">RENAME</h2>
              <div className="panel-changes__divider" role="separator" />
              <ul className="panel-changes__list">
                {PLACEHOLDER_RENAME.map((row) => (
                  <li key={row.id} className="panel-changes__item">
                    <div className="panel-changes__item-top">
                      <span className="panel-changes__old">{row.from}</span>
                      <span className="panel-changes__arrow"> →</span>
                    </div>
                    <div className="panel-changes__new">{row.to}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel-changes__section">
              <h2 className="panel-changes__heading">MOVE</h2>
              <div className="panel-changes__divider" role="separator" />
              <ul className="panel-changes__list">
                {PLACEHOLDER_MOVE.map((row) => (
                  <li key={row.id} className="panel-changes__item">
                    <div className="panel-changes__item-top">
                      <span className="panel-changes__old">{row.from}</span>
                      <span className="panel-changes__arrow"> →</span>
                    </div>
                    <div className="panel-changes__new">{row.to}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel-changes__section">
              <h2 className="panel-changes__heading">DELETE</h2>
              <div className="panel-changes__divider" role="separator" />
              <ul className="panel-changes__list">
                {PLACEHOLDER_DELETE.map((row) => (
                  <li key={row.id} className="panel-changes__item">
                    <div className="panel-changes__item-top">
                      <span className="panel-changes__old">{row.from}</span>
                      <span className="panel-changes__arrow"> →</span>
                    </div>
                    <div className="panel-changes__new">{row.to}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <footer className="panel-changes__footer">
            <button type="button" className="panel-changes__btn panel-changes__btn--reject">
              Reject
            </button>
            <button type="button" className="panel-changes__btn panel-changes__btn--accept">
              Accept all
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

export default App;
