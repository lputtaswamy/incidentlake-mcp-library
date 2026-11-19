import { McpServer } from "@modelcontextprotocol/server";
import type { Toolset } from '../../toolsets';
import { registerApiTool, type ApiToolDefinition } from './defineApiTool';
import { adminTools } from './admin';
import { businessContinuityTools } from './businessContinuity';
import { changeTools } from './changes';
import { cmdbTools } from './cmdb';
import { emergencyTools } from './emergency';
import { evidenceTools } from './evidence';
import { improvementTools } from './improvement';
import { incidentChatTools } from './incidentChat';
import { incidentResponseTools } from './incidentResponse';
import { knowledgeTools } from './knowledge';
import { specificationTools } from './specifications';
import { taskBoardTools } from './taskBoard';
import { workflowTools } from './workflow';
import { incidentCustomFieldTools, customFieldDefinitionTools } from './customFields';
import { itAssetTools } from './itAssets';
import { analyticsDashboardTools } from './analyticsDashboards';
import { portalTools } from './portal';
import { serviceRequestTools } from './serviceRequests';
import { specTraceTools } from './specTrace';

export const TOOLSET_TOOLS: Record<Toolset, ApiToolDefinition[]> = {
  incidents: [...incidentResponseTools, ...incidentChatTools, ...incidentCustomFieldTools, ...analyticsDashboardTools, ...portalTools],
  task_board: taskBoardTools,
  service_requests: serviceRequestTools,
  problems: improvementTools,
  knowledge: [...knowledgeTools, ...evidenceTools],
  changes: changeTools,
  specs: [...specificationTools, ...specTraceTools],
  emergency: emergencyTools,
  services: [...cmdbTools, ...businessContinuityTools, ...itAssetTools],
  settings: [...adminTools, ...workflowTools, ...customFieldDefinitionTools],
};

export function registerApiTools(
  server: McpServer,
  toolsets: ReadonlySet<Toolset>,
  { localFileAccess }: { localFileAccess: boolean },
): void {
  for (const toolset of toolsets) {
    for (const def of TOOLSET_TOOLS[toolset]) {
      if (!localFileAccess && (def.upload || def.download)) continue;
      registerApiTool(server, def);
    }
  }
}
