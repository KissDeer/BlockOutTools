import { useRef } from "react";
import { Download, FolderOpen } from "lucide-react";
import { archiveDraft, downloadProject, parseProjectFile } from "../../domain/persistence";
import { useProjectStore } from "../../store/project-store";
import { IconButton } from "../../components/IconButton";
import { DiskLibraryActions } from "./DiskLibraryActions";

export function ProjectFileActions() {
  const project = useProjectStore((state) => state.project);
  const replaceProject = useProjectStore((state) => state.replaceProject);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar-group">
      <DiskLibraryActions />
      <IconButton label="打开 V2 项目" onClick={() => inputRef.current?.click()}><FolderOpen size={17} /></IconButton>
      <IconButton label="导出 V2 项目" onClick={() => downloadProject(project)}><Download size={17} /></IconButton>
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
