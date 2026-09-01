const MOTOR_CFG = {
  url: 'https://sp-tag-lead-filter-x7k2.pages.dev/sheet-xlsx?qual=encerramentos',
  linhaCabecalho: 5,
  linhaDados: 6,
  abas: function () {
    const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
    const hoje = _hoje(); const ano = hoje.getFullYear();
    const base = 'ENCERRAMENTOS - ' + MESES[hoje.getMonth()];
    return [base + ' ' + ano, base];
  },
  extras: null,
  posProcesso: function (out, nomeAba) { out.mes = nomeAba.replace(/ENCERRAMENTOS\s*-\s*/i, ''); }
};

// =========================================================
// MOTOR DA PLANILHA — le o xlsx do Google direto (via proxy no worker)
// e monta o MESMO JSON que o Apps Script montava. Sem Apps Script.
// EQUIPE DINAMICA: quem estiver na linha de cabecalho da planilha aparece;
// trocou o nome na planilha, trocou no dashboard (sem mexer em codigo).
// =========================================================

const COR_PRODUTO_MAPA = {
  'F1C232': 'Seguro', 'B6D7A8': 'Auxílio', 'CC0000': 'Eventuais', 'B4A7D6': 'Consórcio',
  'EA9999': 'Suspensão', '00FFFF': 'Livre IR', '9FC5E8': 'Abatimento', 'FF00FF': 'INSS',
  '00FF00': 'Direito Médico',
  // presets do Sheets usados por engano (mesma intencao)
  'FBBC04': 'Seguro', 'FF9900': 'Seguro', 'A4C2F4': 'Abatimento', 'EA4335': 'Eventuais',
  '8E7CC3': 'Consórcio', '93C47D': 'Auxílio'
};

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
function _escolherAba(nomes, candidatos) {
  for (const cand of candidatos) {
    const alvo = _norm(cand);
    for (const nm of nomes) if (_norm(nm) === alvo) return nm;
  }
  // fallback: contem
  for (const cand of candidatos) {
    const alvo = _norm(cand);
    for (const nm of nomes) if (_norm(nm).indexOf(alvo) >= 0) return nm;
  }
  return null;
}
function _serialParaData(v) { // serial do Sheets -> {y,m,d} (sem fuso)
  const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}
function _corDaCelula(cell) {
  if (!cell || !cell.s) return null;
  const f = cell.s.fgColor || cell.s.bgColor;
  if (!f || !f.rgb) return null;
  const hex = String(f.rgb).slice(-6).toUpperCase();
  if (hex === 'FFFFFF' || hex === '000000') return null;
  return hex;
}
function _fmtKey(y, m, d) {
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// ---------------------------------------------------------------
// 01/09/2026 (William): "vencedores do mês passado" pra premiação no escritório.
// ?hoje=AAAA-MM-DD na URL finge outra data (só pra testar virada de mês).
// ---------------------------------------------------------------
function _hoje() {
  const m = /[?&]hoje=(\d{4})-(\d{2})-(\d{2})/.exec(location.search || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date();
}
const _MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Conta por pessoa numa aba, com as MESMAS regras do motor principal (equipe dinâmica,
// linha sem data herda a de cima, "aguard" não conta). filtro(dt) decide quais linhas entram.
function _rankingSimples(ws, linhaCab, linhaDados, filtro) {
  const fim = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1').e.r + 1;
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  const equipe = [];
  for (let c = 2; c <= 60; c++) {
    const cc = cel(linhaCab, c); const v = cc && cc.v;
    if (v == null || String(v).trim() === '' || cc.t === 'n' || typeof v === 'number') break;
    const nome = String(v).trim().toUpperCase();
    if (/^(TOTAL|ESTOQUE|REVISADOS|DATA|RESPONS)/.test(nome)) break;
    equipe.push({ nome: nome, col: c, qtd: 0 });
  }
  let total = 0, ultimaData = null, ultimaLinha = -99;
  for (let r = linhaDados; r <= fim; r++) {
    const dc = cel(r, 1); let dt = null;
    if (dc && dc.t === 'n' && dc.v > 20000 && dc.v < 80000) dt = _serialParaData(dc.v);
    else if (dc && dc.t === 'd' && dc.v instanceof Date) dt = { y: dc.v.getFullYear(), m: dc.v.getMonth() + 1, d: dc.v.getDate() };
    else if (dc && dc.v != null && String(dc.v).trim() !== '') continue;   // TOTAL etc.
    if (dt) { ultimaData = dt; ultimaLinha = r; }
    else if (ultimaData && r - ultimaLinha <= 5) dt = ultimaData;
    if (!dt || (filtro && !filtro(dt))) continue;
    for (const p of equipe) {
      const cc = cel(r, p.col); const v = cc && cc.v;
      if (v == null || String(v).trim() === '') continue;
      if (String(v).trim().toLowerCase().indexOf('aguard') >= 0) continue;
      p.qtd++; total++;
    }
  }
  return { ranking: equipe.map(p => ({ nome: p.nome, qtd: p.qtd })).sort((a, b) => b.qtd - a.qtd), total: total };
}
const _MESES_ABA = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
function _infoAba(nome) {   // "ENCERRAMENTOS - AGOSTO 2026" -> {mes: 8, ano: 2026, copia: false}
  const n = _norm(nome);
  const m = /ENCERRAMENTOS\s*-\s*([A-Z]+)\s*(\d{4})?/.exec(n);
  if (!m) return null;
  const idx = _MESES_ABA.map(_norm).indexOf(m[1]);
  if (idx < 0) return null;
  return { mes: idx + 1, ano: m[2] ? +m[2] : null, copia: /COPIA/.test(n) };
}
// Aba de encerramentos mais recente (ano, mês); "Cópia de ..." perde pra aba de verdade do mesmo mês.
function _abaMaisRecente(nomes, anoPadrao) {
  let melhor = null, chave = -1;
  for (const nm of nomes) {
    const i = _infoAba(nm); if (!i) continue;
    const k = (i.ano || anoPadrao) * 12 + i.mes - (i.copia ? 0.5 : 0);
    if (k > chave) { chave = k; melhor = nm; }
  }
  return melhor;
}
// Ranking do mês ANTERIOR (aba mensal dele). null se a aba não existe.
function _vencedoresMesAnterior(wb, agora) {
  const ant = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const y = ant.getFullYear(), m = ant.getMonth() + 1;
  const base = 'ENCERRAMENTOS - ' + _MESES_ABA[m - 1];
  const aba = _escolherAba(wb.SheetNames, [base + ' ' + y, base]);
  if (!aba) return null;
  const r = _rankingSimples(wb.Sheets[aba], MOTOR_CFG.linhaCabecalho, MOTOR_CFG.linhaDados, null);
  return { ano: y, mes: m, rotulo: _MESES_PT[m - 1] + ' · ' + y, aba: aba, ranking: r.ranking, total: r.total };
}

async function montarDadosDaPlanilha() {
  const resp = await fetch(MOTOR_CFG.url + '&_=' + Date.now());
  if (!resp.ok) throw new Error('planilha HTTP ' + resp.status);
  const wb = XLSX.read(await resp.arrayBuffer(), { cellStyles: true });
  let nomeAba = _escolherAba(wb.SheetNames, MOTOR_CFG.abas());
  let avisoAba = null;
  if (!nomeAba) {
    // 01/09/2026: virou o mês, a aba nova ainda não existia e a TV ficou em branco o dia
    // inteiro. Agora mostra a aba mais recente e avisa no rodapé até criarem a do mês.
    nomeAba = _abaMaisRecente(wb.SheetNames, _hoje().getFullYear());
    if (!nomeAba) throw new Error('aba nao encontrada: ' + MOTOR_CFG.abas().join(' | '));
    avisoAba = 'Aba "' + MOTOR_CFG.abas()[0] + '" ainda não existe na planilha · mostrando ' + nomeAba.trim();
  }
  const ws = wb.Sheets[nomeAba];
  const fim = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1').e.r + 1; // ultima linha (1-based)
  const cel = (r, c) => ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];

  // EQUIPE dinamica: linha de cabecalho, colunas B..I
  // EQUIPE: le a linha de cabecalho da coluna B ate a ULTIMA coluna com nome (para no primeiro
  // vazio ou numero). 27/08: a coluna RODRIGO inserida em 25/08 empurrou a SUELLEN pra J e o
  // limite fixo B..I a apagou do painel. Nunca mais limite fixo.
  const equipe = [];
  for (let c = 2; c <= 60; c++) {
    const cc = cel(MOTOR_CFG.linhaCabecalho, c);
    const v = cc && cc.v;
    if (v == null || String(v).trim() === '' || cc.t === 'n' || typeof v === 'number') break;
    const nome = String(v).trim().toUpperCase();
    if (/^(TOTAL|ESTOQUE|REVISADOS|DATA|RESPONS)/.test(nome)) break;
    equipe.push({ nome: nome, col: c });
  }

  const ranking = {}, rankingHoje = {}, seguroPor = {};
  equipe.forEach(p => { ranking[p.nome] = 0; rankingHoje[p.nome] = 0; seguroPor[p.nome] = 0; });
  const tipos = {}; let totalGeral = 0; const evolucaoMap = {};
  const agora = _hoje();
  const hj = { y: agora.getFullYear(), m: agora.getMonth() + 1, d: agora.getDate() };

  let ultimaData = null, ultimaLinha = -99;
  for (let r = MOTOR_CFG.linhaDados; r <= fim; r++) {
    const dc = cel(r, 1);
    let dt = null;
    if (dc && dc.t === 'n' && dc.v > 20000 && dc.v < 80000) dt = _serialParaData(dc.v);
    else if (dc && dc.t === 'd' && dc.v instanceof Date) dt = { y: dc.v.getFullYear(), m: dc.v.getMonth() + 1, d: dc.v.getDate() };
    else if (dc && dc.v != null && String(dc.v).trim() !== '') continue; // texto na coluna A (ex.: TOTAL) = subtotal, pula
    if (dt) { ultimaData = dt; ultimaLinha = r; }
    // 27/08: linha SEM data colada a uma linha datada herda a data de cima (a Ana tinha 2 iniciais
    // assim, linhas 97 e 115, e o painel mostrava 53 em vez dos 55 da planilha).
    else if (ultimaData && r - ultimaLinha <= 5) dt = ultimaData;
    if (!dt) continue;
    const ehHoje = dt.y === hj.y && dt.m === hj.m && dt.d === hj.d;
    const dataKey = _fmtKey(dt.y, dt.m, dt.d);
    for (const p of equipe) {
      const cc = cel(r, p.col);
      const v = cc && cc.v;
      if (v == null || String(v).trim() === '') continue;
      const txt = String(v).trim().toLowerCase();
      if (txt.indexOf('aguard') >= 0) continue;
      ranking[p.nome]++; totalGeral++;
      if (ehHoje) rankingHoje[p.nome]++;
      evolucaoMap[dataKey] = (evolucaoMap[dataKey] || 0) + 1;
      const hex = _corDaCelula(cc);
      if (hex) {
        const produto = COR_PRODUTO_MAPA[hex] || 'Outros';
        tipos[produto] = (tipos[produto] || 0) + 1;
        if (produto === 'Seguro') seguroPor[p.nome]++;
      }
    }
  }

  const rankingArr = equipe.map(p => ({
    nome: p.nome, qtd: ranking[p.nome] || 0, qtdHoje: rankingHoje[p.nome] || 0, seguro: seguroPor[p.nome] || 0
  })).sort((a, b) => (b.qtd - a.qtd) || (b.seguro - a.seguro));
  const tiposArr = Object.keys(tipos).map(t => ({ tipo: t, qtd: tipos[t] })).sort((a, b) => b.qtd - a.qtd);

  const evolucaoArr = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
    const k = _fmtKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    evolucaoArr.push({ data: k, total: evolucaoMap[k] || 0 });
  }

  const out = {
    ranking: rankingArr, tipos: tiposArr, totalGeral: totalGeral,
    evolucao: evolucaoArr, atualizadoEm: new Date().toISOString(), trimestre: nomeAba
  };
  out.vencedores = _vencedoresMesAnterior(wb, agora);   // mês anterior, pra premiação
  out.avisoAba = avisoAba;
  if (MOTOR_CFG.extras) Object.assign(out, MOTOR_CFG.extras(cel));
  if (MOTOR_CFG.posProcesso) MOTOR_CFG.posProcesso(out, nomeAba);
  return out;
}
