import { recover } from '../lib/jobs.mjs';
import { consume } from './queue.mjs';
export default {
  async queue(batch,env) { await consume(batch,env); },
  async scheduled(_controller, env) { if(env.LAB_ENABLED==='true')await recover(env); },
  fetch() { return new Response('Not found',{status:404}); },
};
