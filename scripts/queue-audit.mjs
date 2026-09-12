import {cloudflare,accountId} from './cloudflare-client.mjs';
const queues=await cloudflare(`/accounts/${accountId}/queues`);
const queue=queues.find(q=>q.queue_name==='thirdrailify-lab-jobs');
if(!queue)throw new Error('Lab queue missing');
console.log(JSON.stringify({id:queue.queue_id,name:queue.queue_name,settings:queue.settings,consumers:queue.consumers}));
if(process.argv.includes('--probe')){
 // A nonexistent, randomly generated job has no account/project and cannot submit.
 const jobId=crypto.randomUUID();
 await cloudflare(`/accounts/${accountId}/queues/${queue.queue_id}/messages`,{method:'POST',body:{content_type:'json',body:{jobId}}});
 console.log(JSON.stringify({probe:'nonexistent job; no provider submission possible',jobId}));
}
