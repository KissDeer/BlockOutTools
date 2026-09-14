import { useRef } from "react";
import { archiveDraft, parseProjectFile } from "../../domain/persistence";
import { useProjectStore } from "../../store/project-store";
import { DiskLibraryActions } from "./DiskLibraryActions";

export function ProjectFileActions() {
  const replaceProject = useProjectStore((state) => state.replaceProject);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar-group project-file-actions">
      <DiskLibraryActions onImport={() => inputRef.current?.click()} />
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".json,.blockout.json"
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          try {
            const incoming = parseProjectFile(await file.text());
            archiveDraft(useProjectStore.getState().project);
            replaceProject(incoming);
          } catch (error) {
            window.alert(`项目文件无效：${error instanceof Error ? error.message : "未知错误"}`);
          } finally {
            input.value = "";
          }
        }}
      />
    </div>
  );
}
