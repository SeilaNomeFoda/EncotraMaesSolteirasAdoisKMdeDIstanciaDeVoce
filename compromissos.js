/* ============================================================
   COMPROMISSOS + NOTIFICAÇÕES
   Cada compromisso: { id, titulo, data_hora: "AAAA-MM-DDTHH:MM", aviso_min }
   O aviso é mostrado de três formas:
     1) notificação do sistema (PC e celular) via Service Worker
     2) aviso dentro da página (toast)
     3) som + vibração (celular)
   Cada aparelho guarda em localStorage quais avisos já mostrou,
   assim o PC e o celular avisam cada um por conta própria.
   ============================================================ */
const API_EVENTOS = '/api/compromissos';
const CHAVE_AVISADOS = 'compromissosAvisados';

let compromissos = [];
let swRegistro = null;

/* ============================================================
   SERVICE WORKER + PERMISSÃO
   ============================================================ */
const btnNotify = document.getElementById('btnNotify');

async function registrarServiceWorker(){
  if(!('serviceWorker' in navigator)) return;
  try{
    swRegistro = await navigator.serviceWorker.register('/sw.js');
  }catch(e){
    console.warn('Service worker não registrado:', e);
  }
}

function atualizarBotaoNotificacao(){
  if(!('Notification' in window)){
    btnNotify.textContent = '🔕 Navegador sem suporte';
    btnNotify.disabled = true;
    return;
  }
  if(!window.isSecureContext){
    btnNotify.textContent = '🔕 Requer HTTPS';
    btnNotify.title = 'Notificações do sistema só funcionam em https:// ou localhost';
    btnNotify.disabled = true;
    return;
  }
  const estados = {
    granted: '🔔 Notificações ativas',
    denied:  '🔕 Notificações bloqueadas',
    default: '🔔 Ativar notificações'
  };
  btnNotify.textContent = estados[Notification.permission];
  btnNotify.classList.toggle('active', Notification.permission === 'granted');
}

btnNotify.addEventListener('click', async () => {
  if(Notification.permission === 'denied'){
    alert('As notificações foram bloqueadas. Libere nas configurações do site no navegador.');
    return;
  }
  await Notification.requestPermission();
  atualizarBotaoNotificacao();
  if(Notification.permission === 'granted'){
    notificar('Notificações ativadas', 'Você será avisado dos seus compromissos.', 'teste');
  }
});

/* ============================================================
   EXIBIR AVISO
   ============================================================ */
async function notificar(titulo, corpo, tag){
  mostrarToast(titulo, corpo);
  tocarSom();
  if(navigator.vibrate) navigator.vibrate([200, 100, 200]);

  if(!('Notification' in window) || Notification.permission !== 'granted') return;
  const opcoes = { body: corpo, tag: String(tag), renotify: true, vibrate: [200, 100, 200] };
  try{
    // no celular (Android) só funciona via service worker
    const reg = swRegistro || await navigator.serviceWorker?.ready;
    if(reg){
      await reg.showNotification(titulo, opcoes);
    }else{
      new Notification(titulo, opcoes);
    }
  }catch(e){
    console.warn('Falha ao mostrar notificação:', e);
  }
}

const toastStack = document.getElementById('toastStack');

function mostrarToast(titulo, corpo){
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-text"><strong></strong><span></span></div>
    <button type="button" class="remove-btn" aria-label="Fechar aviso">
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
    </button>
  `;
  toast.querySelector('strong').textContent = titulo;
  toast.querySelector('span').textContent = corpo;

  const fechar = () => toast.remove();
  toast.querySelector('button').addEventListener('click', fechar);
  setTimeout(fechar, 15000);
  toastStack.appendChild(toast);
}

let audioCtx = null;
function tocarSom(){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25].forEach(atraso => {
      const osc = audioCtx.createOscillator();
      const ganho = audioCtx.createGain();
      osc.frequency.value = 880;
      ganho.gain.setValueAtTime(0.15, audioCtx.currentTime + atraso);
      ganho.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + atraso + 0.2);
      osc.connect(ganho).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + atraso);
      osc.stop(audioCtx.currentTime + atraso + 0.2);
    });
  }catch(e){ /* navegador bloqueou o áudio */ }
}

/* ============================================================
   CONTROLE DE AVISOS JÁ MOSTRADOS (por aparelho)
   ============================================================ */
function lerAvisados(){
  try{ return new Set(JSON.parse(localStorage.getItem(CHAVE_AVISADOS)) || []); }
  catch(e){ return new Set(); }
}

function salvarAvisados(avisados){
  try{ localStorage.setItem(CHAVE_AVISADOS, JSON.stringify([...avisados])); }
  catch(e){ /* modo privado */ }
}

// a chave inclui data e antecedência: se o compromisso mudar, avisa de novo
const chaveAviso = c => `${c.id}|${c.data_hora}|${c.aviso_min}`;

function verificarCompromissos(){
  const agora = Date.now();
  const avisados = lerAvisados();

  compromissos.forEach(c => {
    const inicio = new Date(c.data_hora).getTime();
    const momentoAviso = inicio - c.aviso_min * 60000;
    const chave = chaveAviso(c);

    // não avisa compromissos que já passaram há mais de 1 hora
    if(agora >= momentoAviso && agora < inicio + 3600000 && !avisados.has(chave)){
      avisados.add(chave);
      notificar(`📅 ${c.titulo}`, descreverTempo(inicio, agora), c.id);
    }
  });

  salvarAvisados(avisados);
  renderCompromissos();
}

function descreverTempo(inicio, agora){
  const min = Math.round((inicio - agora) / 60000);
  const hora = new Date(inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if(min <= 0) return `Começou às ${hora}`;
  if(min < 60) return `Começa em ${min} min (às ${hora})`;
  if(min < 1440) return `Começa em ${Math.round(min / 60)} h (às ${hora})`;
  return `Amanhã às ${hora}`;
}

/* ============================================================
   LISTA DE COMPROMISSOS
   ============================================================ */
const eventList = document.getElementById('eventList');

function renderCompromissos(){
  eventList.innerHTML = '';
  if(compromissos.length === 0){
    const vazio = document.createElement('li');
    vazio.className = 'event-empty';
    vazio.textContent = 'Nenhum compromisso agendado.';
    eventList.appendChild(vazio);
    return;
  }

  const agora = Date.now();
  compromissos.forEach(c => {
    const data = new Date(c.data_hora);
    const item = document.createElement('li');
    item.className = 'event-item' + (data.getTime() < agora ? ' past' : '');
    item.innerHTML = `
      <div class="event-info">
        <p class="material-name"></p>
        <span class="material-category"></span>
      </div>
      <button class="remove-btn" type="button" aria-label="Remover compromisso">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
      </button>
    `;
    item.querySelector('.material-name').textContent = c.titulo;
    item.querySelector('.material-category').textContent = data.toLocaleString('pt-BR', {
      weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    item.querySelector('.remove-btn').addEventListener('click', () => removerCompromisso(c.id));
    eventList.appendChild(item);
  });
}

async function carregarCompromissos(){
  try{
    compromissos = await api(API_EVENTOS);
    verificarCompromissos();
  }catch(e){
    console.error(e);
  }
}

document.getElementById('eventForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const titulo = document.getElementById('eventTitle').value.trim();
  const dataHora = document.getElementById('eventDate').value;
  if(!titulo || !dataHora) return;

  executar(async () => {
    const novo = await api(API_EVENTOS, {
      method: 'POST',
      body: {
        titulo,
        data_hora: dataHora,
        aviso_min: Number(document.getElementById('eventAviso').value)
      }
    });
    compromissos.push(novo);
    compromissos.sort((a, b) => a.data_hora.localeCompare(b.data_hora));
    document.getElementById('eventTitle').value = '';
    renderCompromissos();
  });
});

function removerCompromisso(id){
  executar(async () => {
    await api(`${API_EVENTOS}/${id}`, { method: 'DELETE' });
    compromissos = compromissos.filter(c => c.id !== id);
    renderCompromissos();
  });
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
atualizarBotaoNotificacao();
registrarServiceWorker();
carregarCompromissos();

setInterval(verificarCompromissos, 15000);   // confere a cada 15 s
setInterval(carregarCompromissos, 60000);    // sincroniza com outros aparelhos a cada 1 min

// ao voltar para a aba (comum no celular), confere na hora
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') carregarCompromissos();
});
