// Teste de regressão do motor do painel de Encerramentos (16/11/2026).
// Bug: na aba de NOVEMBRO apagaram uma linha do topo; os nomes subiram da linha 5 para a 4 e o painel
// leu um número de pasta como se fosse a equipe (advogados zerados, "100258-000001" no ranking).
// Monta duas planilhas falsas (layout antigo e layout com a linha apagada) e roda o motor de verdade.
//   node test-cabecalho.js                                   -> testa o dados-planilha.js
//   MOTOR=dados-planilha.js.bak-2026-11-16-antes-cabecalho-automatico node test-cabecalho.js  -> versão antiga (tem que falhar)
const fs = require('fs'), path = require('path'), vm = require('vm');
const AQUI = __dirname;
const ctx = { console, Date, Math, location: { search: '?hoje=2026-11-16' } };
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(AQUI, 'xlsx.full.min.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(AQUI, process.env.MOTOR || 'dados-planilha.js'), 'utf8'), ctx);
const XLSX = ctx.XLSX;
let falhas = 0;
const checa = (nome, ok, det) => { console.log((ok ? 'ok    ' : 'FALHA ') + nome + (ok ? '' : '  (' + det + ')')); if (!ok) falhas++; };

function aba(apagouLinha) {
  const linhas = [
    [null, 'TOTAL'],
    ['TOTAL', 2, 1, 1],
    ['DATA', 'RESPONSÁVEL'],
    [null, 'JULIA', 'ANA', 'EBONY'],
    [46329, '100258-000001', '0200002-000487', null],   // 2026-11-02
    [46329, null, '0200002-000936', '0200002-000111'],
    [46330, 'aguardando', null, '0200002-000222'],
  ];
  if (!apagouLinha) linhas.splice(0, 0, [null]);         // layout antigo: uma linha a mais no topo
  return XLSX.utils.aoa_to_sheet(linhas);
}
async function rodar(apagouLinha) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba(apagouLinha), 'ENCERRAMENTOS - NOVEMBRO 2026');
  XLSX.utils.book_append_sheet(wb, aba(apagouLinha), 'ENCERRAMENTOS - OUTUBRO 2026');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  ctx.fetch = async () => ({ ok: true, arrayBuffer: async () => buf });
  return vm.runInContext('montarDadosDaPlanilha()', ctx);
}
(async () => {
  for (const [rot, apagou] of [['layout antigo (nomes na linha 5)', false], ['linha do topo apagada (nomes na linha 4)', true]]) {
    const out = await rodar(apagou);
    const nomes = out.ranking.map(p => p.nome).sort().join(',');
    checa(rot + ': equipe = ANA, EBONY, JULIA', nomes === 'ANA,EBONY,JULIA', nomes);
    checa(rot + ': total = 5 (aguardando não conta)', out.totalGeral === 5, out.totalGeral);
    const v = out.vencedores && out.vencedores.ranking.map(p => p.nome + ':' + p.qtd).join(',');
    checa(rot + ': vencedores de outubro lidos certo', v && v.indexOf('ANA:2') >= 0 && v.indexOf('100258') < 0, v);
  }
  console.log('\n' + (falhas ? falhas + ' falha(s)' : 'TUDO OK') + ' (' + (process.env.MOTOR || 'dados-planilha.js') + ')');
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('ERRO', e.message); process.exit(1); });
