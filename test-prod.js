const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const envFile = fs.readFileSync('.env.production', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = String(m[2]).trim();
});
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.from('ordenes').select('id, numero').limit(5);
  console.log('Error?', error);
  console.log('Data:', data);
}
test().catch(console.error);
