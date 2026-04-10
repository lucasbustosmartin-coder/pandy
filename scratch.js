require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: movsCli, error } = await supabase
    .from('movimientos_cuenta_corriente')
    .select('id, orden_id, estado, concepto')
    .eq('estado', 'anulado');
    
  console.log('Movs Cli Anulados:', movsCli?.length);

  const { data: trx, error2 } = await supabase
    .from('transacciones')
    .select('id, estado, numero')
    .eq('estado', 'anulada');
  console.log('Trx Anuladas:', trx?.length);
}
run();
