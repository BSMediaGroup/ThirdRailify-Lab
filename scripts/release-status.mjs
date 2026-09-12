import {cloudflare,accountId} from './cloudflare-client.mjs';
for(const name of ['thirdrailify-lab','thirdrailify-admin']){
 const p=await cloudflare(`/accounts/${accountId}/pages/projects/${name}`);
 const d=p.latest_deployment;
 console.log(JSON.stringify({project:name,latest:d?.id,commit:d?.deployment_trigger?.metadata?.commit_hash,stage:d?.latest_stage,queues:p.deployment_configs?.production?.queue_producers,canonical:p.canonical_deployment?.id}));
}
