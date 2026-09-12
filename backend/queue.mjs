import { recover } from '../lib/jobs.mjs';
import { ready } from '../lib/storage.mjs';

const active = new Set(['queued','submitting','processing','import_pending']);
export async function consume(batch,env,provider){
  const db=await ready(env);
  for(const message of batch.messages){
    const jobId=message.body?.jobId;
    if(!/^[a-f0-9-]{36}$/.test(jobId||'')){message.ack();continue;}
    if(env.LAB_ENABLED!=='true'){message.retry({delaySeconds:300});continue;}
    await recover(env,provider,jobId);
    const row=await db.prepare('SELECT status,next_at,lease_until FROM jobs WHERE id=?').bind(jobId).first();
    if(!row||!active.has(row.status)){message.ack();continue;}
    if(message.attempts>=100){
      // Exhaustion never creates a new paid submission. A known prediction or
      // staged response remains available for scheduled/operator reconciliation.
      await db.prepare("UPDATE jobs SET status=CASE status WHEN 'queued' THEN 'failed' WHEN 'import_pending' THEN 'download_failed' WHEN 'submitting' THEN 'submission_uncertain' ELSE 'interrupted' END,phase='Automatic processing limit reached; review required',error='Processing could not finish within the recovery limit.' WHERE id=? AND lease_until<? AND status IN ('queued','submitting','processing','import_pending')").bind(jobId,Date.now()).run();
      message.ack();continue;
    }
    message.retry({delaySeconds:Math.min(43200,Math.max(15,Math.ceil((Math.max(row.next_at,row.lease_until)-Date.now())/1000)))});
  }
}
