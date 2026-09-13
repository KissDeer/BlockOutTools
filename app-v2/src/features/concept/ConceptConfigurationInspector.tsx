import { useMemo } from "react";
import { CircleAlert, ExternalLink, Layers, Wand2 } from "lucide-react";
import { createEmptyTopology } from "../../domain/concept";
import { validateConfiguration } from "../../domain/concept-configuration";
import { useProjectStore } from "../../store/project-store";
import { moduleColor } from "./module-colors";

export function ConceptConfigurationInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = project.concept ?? createEmptyTopology();
  const configuration = useProjectStore((state) => state.configuration);
  const generateConfiguration = useProjectStore((state) => state.generateConfiguration);
  const applyConfigurationCandidate = useProjectStore((state) => state.applyConfigurationCandidate);
  const openModuleById = useProjectStore((state) => state.openModuleById);

  const issues = useMemo(() => (configuration ? validateConfiguration(topology, configuration) : []), [configuration, topology]);
  const errors = issues.filter((issue) => issue.severity === "error").length;

  return (
    <div className="inspector-content">
      <header className="inspector-heading">
        <span>基础构型</span>
        <strong>{topology.modules.length} 个模块</strong>
        <small>体块 + 端口，落在阶段二的模块定义里</small>
      </header>

      <section className="inspector-section">
        <h3>交付门</h3>
        {!configuration
          ? <p className="field-help" style={{ marginTop: 0 }}>还没有生成或拉取构型。</p>
          : errors === 0
            ? <p className="field-help" style={{ marginTop: 0 }}>规则检查没有拦住交付的问题。</p>
            : <p className="field-help" style={{ marginTop: 0 }}>还有 {errors} 个错误，套用被拦下。</p>}
        {issues.map((issue) => (
          <div key={issue.id} className={`logic-issue is-${issue.severity === "error" ? "error" : "warning"}`}>
            <CircleAlert size={13} /><span>{issue.message}</span>
          </div>
        ))}
      </section>

      <section className="inspector-section">
        <h3><Layers size={13} /> 模块与构型</h3>
        {topology.modules.length === 0 ? <p className="field-help" style={{ marginTop: 0 }}>先完成横向拆解。</p> : null}
        {topology.modules.map((module, index) => {
          const bound = module.moduleDefinitionId ? project.modules.find((item) => item.id === module.moduleDefinitionId) : null;
          const blocks = bound?.blocks.filter((block) => block.type !== "port").length ?? 0;
          const ports = bound?.blocks.filter((block) => block.type === "port").length ?? 0;
          return (
            <div key={module.id} className="configuration-row">
              <i style={{ background: moduleColor(index) }} />
              <span>
                <strong>{module.name}</strong>
                <small>
                  {module.nodeIds.length} 区域 ·{" "}
                  {bound ? `${blocks} 体块 / ${ports} 端口 · r${bound.revision}` : "尚未生成构型"}
                </small>
              </span>
              {bound ? (
                <button type="button" className="secondary-command" onClick={() => openModuleById(bound.id)}>
                  <ExternalLink size={13} />进入
                </button>
              ) : null}
            </div>
          );
        })}
        {topology.modules.length ? (
          <button type="button" className="secondary-command" style={{ marginTop: 8, width: "100%" }} onClick={generateConfiguration}>
            <Wand2 size={14} />按角色模板生成构型
          </button>
        ) : null}
      </section>

      {configuration ? (
        <div className="inspector-commands">
          <button type="button" className="primary-command" disabled={errors > 0} onClick={applyConfigurationCandidate}>
            套用构型到模块定义
          </button>
          <p className="field-help">已有绑定的模块会被整体替换积木并递增修订；这是一次可撤销事务。</p>
        </div>
      ) : null}
    </div>
  );
}
