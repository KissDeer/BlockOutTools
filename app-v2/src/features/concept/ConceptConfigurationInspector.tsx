import { useMemo } from "react";
import { CircleAlert, ExternalLink, Layers, Wand2 } from "lucide-react";
import { validateConfiguration } from "../../domain/concept-configuration";
import { allModules } from "../../domain/concept-scopes";
import { useProjectStore } from "../../store/project-store";
import { moduleColor } from "./module-colors";
import { useCurrentTopology, useRootTopology } from "./use-current-topology";

export function ConceptConfigurationInspector() {
  const project = useProjectStore((state) => state.project);
  const topology = useCurrentTopology();
  const rootTopology = useRootTopology();
  const configuration = useProjectStore((state) => state.configuration);
  const generateConfiguration = useProjectStore((state) => state.generateConfiguration);
  const applyConfigurationCandidate = useProjectStore((state) => state.applyConfigurationCandidate);
  const openModuleById = useProjectStore((state) => state.openModuleById);
  const generateAssembly = useProjectStore((state) => state.generateAssembly);
  const assemblyResult = useProjectStore((state) => state.assemblyResult);

  const issues = useMemo(() => (configuration ? validateConfiguration(topology, configuration) : []), [configuration, topology]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  // 构型可能落在任意一层作用域，判断要覆盖全树
  const hasConfiguredModule = useMemo(() => allModules(rootTopology).some(({ module }) => module.moduleDefinitionId), [rootTopology]);

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

      <section className="inspector-section">
        <h3>组装到阶段二</h3>
        <p className="field-help" style={{ marginTop: 0 }}>
          把每个模块落成一个实例，放在概念给的相对位置上；跨模块链路落成连接，间距取概念里的实际值。
        </p>
        <button
          type="button"
          className="primary-command"
          style={{ width: "100%" }}
          disabled={!hasConfiguredModule}
          onClick={generateAssembly}
        >
          生成组装
        </button>
        {!hasConfiguredModule ? (
          <p className="field-help">先生成并套用基础构型，模块才有几何可以摆放。</p>
        ) : null}
        {assemblyResult ? (
          <dl className="summary-list" style={{ marginTop: 8 }}>
            <div><dt>新建实例</dt><dd>{assemblyResult.instancesCreated}</dd></div>
            <div><dt>移动实例</dt><dd>{assemblyResult.instancesMoved}</dd></div>
            <div><dt>新建连接</dt><dd>{assemblyResult.connectionsCreated}</dd></div>
            <div><dt>更新连接</dt><dd>{assemblyResult.connectionsUpdated}</dd></div>
          </dl>
        ) : null}
        {assemblyResult?.unplacedModules.length ? (
          <div className="logic-issue is-warning"><CircleAlert size={13} /><span>这些模块没有相对位置，实例放在原点：{assemblyResult.unplacedModules.join("、")}</span></div>
        ) : null}
        {assemblyResult?.missingPorts.length ? (
          <div className="logic-issue is-error"><CircleAlert size={13} /><span>这些链路缺少端口，没有连线：{assemblyResult.missingPorts.join("、")}</span></div>
        ) : null}
      </section>
    </div>
  );
}
