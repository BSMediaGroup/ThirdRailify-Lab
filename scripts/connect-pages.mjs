import { cloudflare, accountId } from './cloudflare-client.mjs';
import { access } from 'node:fs/promises';
await access(new URL('../dist/index.html', import.meta.url));
const projects = await cloudflare(`/accounts/${accountId}/pages/projects`);
let project = projects.find(p => p.name === 'thirdrailify-lab');
if (!project) project = await cloudflare(`/accounts/${accountId}/pages/projects`, { method: 'POST', body: {
  name: 'thirdrailify-lab', production_branch: 'main',
  build_config: { build_command: 'npm run build', destination_dir: 'dist', root_dir: '' },
  source: { type: 'github', config: {
    owner: 'BSMediaGroup', owner_id: '144799251', repo_name: 'ThirdRailify-Lab', repo_id: '1364133403',
    production_branch: 'main', production_deployments_enabled: false, preview_deployment_setting: 'none', pr_comments_enabled: false,
  } },
  deployment_configs: {
    production: { fail_open: false, compatibility_date: '2026-09-12', compatibility_flags: ['nodejs_compat'], env_vars: { LAB_ENABLED: { type: 'plain_text', value: 'false' }, NODE_VERSION: { type: 'plain_text', value: '22.16.0' } } },
    preview: { fail_open: false, env_vars: { LAB_ENABLED: { type: 'plain_text', value: 'false' } }, d1_databases: {}, r2_buckets: {} },
  },
} });
if (project.source?.type !== 'github' || project.source.config?.repo_name !== 'ThirdRailify-Lab') throw new Error('Expected the Git-integrated Lab project.');
console.log(JSON.stringify({ id: project.id, name: project.name, source: project.source, build: project.build_config }, null, 2));
