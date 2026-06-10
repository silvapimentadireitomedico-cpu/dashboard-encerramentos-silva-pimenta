// =========================================================
// Silva Pimenta — Dashboard de Encerramentos
// =========================================================

// URL do Apps Script implantado como Web App.
// Endpoint que serve o JSON da planilha de encerramentos.
const API_URL = 'https://script.google.com/macros/s/AKfycbxTjbLXERLcSTgMTM_KRlaEdjDp9bT4hb5pjGzHdYEH400IJTjZNz6GQREBICSTk64PYg/exec';

// Equipe na ordem que aparece na planilha
// (Sarah entrou no lugar do Rafael em junho/2026)
const EQUIPE = ['MAX', 'HUGO', 'STELLA', 'SARAH', 'NATALY', 'ISABELLA', 'ANA', 'SUELLEN'];

// Cores das pílulas dos tipos de processo
const COR_TIPO = {
  'Auxílio': '#B6D7A8',
  'Consórcio': '#B4A7D6',
  'Abatimento': '#9FC5E8',
  'Suspensão': '#EA9999',
  'Seguro': '#F1C232',
  'INSS': '#FF66FF',
  'Eventuais': '#CC0000',
  'Livre IR': '#66E0E0',
  'Direito Médico': '#66E066',
  'Outros': '#888888'
};

// Polling — busca novos dados a cada 30s
const POLL_MS = 30000;

// Estado pra detectar troca de 1º lugar entre refreshes
let ultimoLider = null;

// =========================================================
// BUSCA DE DADOS
// =========================================================

async function fetchDados() {
  const url = API_URL || 'data-mock.json';
  try {
    const r = await fetch(url + (API_URL ? '?_=' + Date.now() : ''));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (err) {
    console.error('Erro buscando dados:', err);
    return null;
  }
}

// =========================================================
// RENDERIZAÇÃO
// =========================================================

// Cache buster pras fotos (auto-reload de 30min refresca)
const FOTO_VER = Date.now();
const FOTO_EXTS = ['png', 'jpg'];

function setFotoOrInicial(el, nome) {
  const slug = nome.toLowerCase().trim();
  const tentar = (idx) => {
    if (idx >= FOTO_EXTS.length) {
      el.style.backgroundImage = '';
      el.classList.remove('with-image');
      el.textContent = nome.charAt(0);
      return;
    }
    const img = new Image();
    img.onload = () => {
      el.style.backgroundImage = `url('${img.src}')`;
      el.classList.add('with-image');
      el.textContent = '';
    };
    img.onerror = () => tentar(idx + 1);
    img.src = `fotos/${slug}.${FOTO_EXTS[idx]}?v=${FOTO_VER}`;
  };
  tentar(0);
}

// Toca "ding-dong" curto via Web Audio API quando o 1º lugar troca.
function tocarSomNovoLider() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tom = (freq, inicio, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + inicio;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
    };
    tom(880, 0, 0.4);
    tom(1318.51, 0.25, 0.6);
  } catch (e) {
    // Autoplay pode ser bloqueado antes da 1ª interação no Silk; silencia
  }
}

function animarNumero(el, alvo, duracao = 1200) {
  const inicio = parseInt(el.dataset.count || '0', 10);
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - t0) / duracao);
    const ease = 1 - Math.pow(1 - t, 3);
    const valor = Math.round(inicio + (alvo - inicio) * ease);
    el.textContent = valor;
    if (t < 1) requestAnimationFrame(tick);
    else el.dataset.count = alvo;
  }
  requestAnimationFrame(tick);
}

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function renderHeader(dados) {
  // Mês vem da API (nome da aba real) — garante que o header sempre
  // bate com os dados exibidos, mesmo se o relógio da TV estiver errado
  // ou na virada de mês com a aba nova ainda não criada.
  let mesTexto;
  if (dados.mes) {
    const partes = dados.mes.trim().split(/\s+/); // ex: ["JUNHO", "2026"]
    const nome = partes[0].charAt(0) + partes[0].slice(1).toLowerCase();
    mesTexto = nome + (partes[1] ? ` · ${partes[1]}` : '');
  } else {
    const agora = new Date();
    mesTexto = `${MESES_PT[agora.getMonth()]} · ${agora.getFullYear()}`;
  }

  document.getElementById('trimestreValue').textContent = 'Encerramentos';
  document.getElementById('periodValue').textContent = mesTexto;

  const totalEl = document.getElementById('totalValue');
  animarNumero(totalEl, dados.totalGeral || 0);
}

function renderPodio(dados) {
  const top3 = (dados.ranking || []).slice(0, 3);

  // Detecta troca de 1º lugar e toca som (não toca na 1ª carga)
  const liderAtual = top3[0] ? top3[0].nome : null;
  if (ultimoLider !== null && liderAtual && liderAtual !== ultimoLider) {
    tocarSomNovoLider();
  }
  if (liderAtual) ultimoLider = liderAtual;

  // ordem na tela: 2º (esq), 1º (centro), 3º (dir)
  const ordem = [
    { idx: 1, el: 'podium2' },
    { idx: 0, el: 'podium1' },
    { idx: 2, el: 'podium3' }
  ];
  ordem.forEach(({ idx, el }) => {
    const nodeEl = document.getElementById(el);
    const item = top3[idx];
    const nameEl = nodeEl.querySelector('.podium-name');
    const numEl = nodeEl.querySelector('.podium-count-num');
    const photoEl = nodeEl.querySelector('.podium-photo');
    if (!item) {
      nameEl.textContent = '—';
      numEl.textContent = '0';
      numEl.dataset.count = 0;
      photoEl.style.backgroundImage = '';
      return;
    }
    nameEl.textContent = capitalize(item.nome);
    setFotoOrInicial(photoEl, item.nome);
    animarNumero(numEl, item.qtd);
  });
}

function renderRanking(dados) {
  const list = document.getElementById('rankingList');
  list.innerHTML = '';
  const ranking = dados.ranking || [];
  if (ranking.length === 0) return;
  const max = Math.max(...ranking.map(r => r.qtd), 1);

  ranking.forEach((item, i) => {
    const row = document.createElement('div');
    const semHoje = (item.qtdHoje || 0) === 0;
    row.className = 'ranking-item' + (semHoje ? ' sem-hoje' : '');
    row.innerHTML = `
      <div class="ranking-pos">${i + 1}º</div>
      <div class="ranking-photo"></div>
      <div class="ranking-bar-wrap">
        <div class="ranking-bar" style="width: 0%"></div>
        <div class="ranking-name">${capitalize(item.nome)}</div>
      </div>
      <div class="ranking-qtd">${item.qtd}</div>
    `;
    list.appendChild(row);
    const photoEl = row.querySelector('.ranking-photo');
    setFotoOrInicial(photoEl, item.nome);
    requestAnimationFrame(() => {
      row.querySelector('.ranking-bar').style.width = ((item.qtd / max) * 100) + '%';
    });
  });
}

function renderTipos(dados) {
  const grid = document.getElementById('tiposGrid');
  grid.innerHTML = '';
  const tipos = dados.tipos || [];
  tipos.forEach(t => {
    const cor = COR_TIPO[t.tipo] || COR_TIPO['Outros'];
    const card = document.createElement('div');
    card.className = 'tipo-card';
    card.innerHTML = `
      <div class="tipo-dot" style="background:${cor}"></div>
      <div class="tipo-info">
        <div class="tipo-qtd">${t.qtd}</div>
        <div class="tipo-nome">${t.tipo}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function renderFooter(dados) {
  const tot = (dados.ranking || []).reduce((s, r) => s + (r.qtdHoje || 0), 0);
  const top = [...(dados.ranking || [])]
    .filter(r => (r.qtdHoje || 0) > 0)
    .sort((a, b) => b.qtdHoje - a.qtdHoje)[0];
  const todayEl = document.getElementById('footerToday');
  if (tot === 0) {
    todayEl.textContent = 'Aguardando primeiros registros do dia';
  } else if (top) {
    todayEl.textContent = `Hoje: ${tot} encerramentos · destaque ${capitalize(top.nome)} (${top.qtdHoje})`;
  } else {
    todayEl.textContent = `Hoje: ${tot} encerramentos`;
  }
  document.getElementById('footerTime').textContent =
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function capitalize(nome) {
  return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
}

// =========================================================
// LOOP
// =========================================================

async function refresh() {
  const dados = await fetchDados();
  if (!dados || dados.erro) return;
  renderHeader(dados);
  renderPodio(dados);
  renderRanking(dados);
  renderTipos(dados);
  renderFooter(dados);
}

// =========================================================
// SCALE AUTOMÁTICO — dashboard fixo 1920x1080 escala pra caber
// em qualquer tela (TV, monitor, laptop) mantendo proporção
// =========================================================
function scaleDashboard() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return;
  const baseW = 1920, baseH = 1080;
  const scale = Math.min(window.innerWidth / baseW, window.innerHeight / baseH);
  container.style.transform = 'scale(' + scale + ')';
}
window.addEventListener('resize', scaleDashboard);
scaleDashboard();

// =========================================================
// KEEPALIVE — 3 camadas pra impedir TV/Fire Stick de dormir
// =========================================================

// Camada 1 — Wake Lock API
(async function pedirWakeLock() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  const requisitar = async () => {
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => {});
    } catch (e) {}
  };
  await requisitar();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && (!lock || lock.released)) {
      await requisitar();
    }
  });
})();

// Camada 2 — Vídeo keepalive já está no HTML

// Camada 3 — Auto-reload de 30min (rede de segurança)
setTimeout(() => location.reload(), 30 * 60 * 1000);

refresh();
setInterval(refresh, POLL_MS);
