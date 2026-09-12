import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { OpenAIService } = require('../desktop/openai-service.cjs');
const profile = path.resolve('test-results', `openai-readonly-${Date.now()}`);
const output = path.resolve(process.env.COSMOS_QA_OUT || 'docs/verification/openai-protocol-0.5');
const service = new OpenAIService({
  runtimeDir: path.resolve('runtime'),
  userData: profile,
  openExternal: () => {
    throw new Error('This read-only check must not open a browser');
  },
});
try {
  const status = await service.getStatus();
  if (status.authenticated !== false || status.state !== 'signed-out')
    throw new Error('Fresh isolated profile did not report signed-out');
  if (!status.models.length) throw new Error('No model catalog returned');
  const config = (await service.transport.request('config/read', { includeLayers: false })).config;
  const thread = await service.transport.request('thread/start', {
    cwd: service.workspace,
    approvalPolicy: 'on-request',
    sandbox: 'read-only',
    baseInstructions: 'Учебный преподаватель. Инструменты отключены.',
    ephemeral: true,
    environments: [],
    dynamicTools: [],
    selectedCapabilityRoots: [],
  });
  if (!thread.thread?.id) throw new Error('No thread returned');
  await service.transport.request('thread/unsubscribe', { threadId: thread.thread.id });
  const unauthenticatedTurn = await service.generate({
    conversationId: 'probe',
    subject: 'math',
    instructions: '',
    messages: [{ role: 'user', content: 'Что такое площадь?' }],
  });
  if (unauthenticatedTurn.ok || unauthenticatedTurn.text)
    throw new Error('Unsigned model response was misrepresented');
  service.stop();
  const restored = await service.getStatus();
  if (restored.state !== 'signed-out' || restored.authenticated !== false)
    throw new Error('Process restart did not restore truthful account state');
  await fs.mkdir(output, { recursive: true });
  const report = {
    checkedAt: new Date().toISOString(),
    runtimeVersion: status.runtimeVersion,
    status,
    loginStarted: false,
    credentialFilesRead: false,
    modelGeneration: false,
    nativeUiTest: false,
    thread: {
      created: true,
      ephemeral: true,
      environmentAccess: false,
      sandbox: thread.sandbox,
      approvalPolicy: thread.approvalPolicy,
    },
    effectiveRestrictions: {
      shell: config.features.shell_tool,
      unifiedExec: config.features.unified_exec,
      apps: config.features.apps,
      plugins: config.features.plugins,
      browser: config.features.browser_use,
      computer: config.features.computer_use,
      mcpServerCount: Object.keys(config.mcp_servers || {}).length,
      credentialsStore: config.cli_auth_credentials_store,
    },
    unsignedTurnRefused: true,
    processRestartChecked: true,
    limits:
      'No browser login, token refresh, authenticated inference or native UI acceptance performed.',
  };
  await fs.writeFile(path.join(output, 'read-only.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  service.stop();
}
