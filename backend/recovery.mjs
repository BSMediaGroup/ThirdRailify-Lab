import { recover } from '../lib/jobs.mjs';
export default {
  async scheduled(_controller, env) { if(env.LAB_ENABLED==='true')await recover(env); },
  fetch() { return new Response('Not found',{status:404}); },
};
