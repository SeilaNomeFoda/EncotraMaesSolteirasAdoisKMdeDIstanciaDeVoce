/* ============================================================
   ESTADO
   Cada material do usuário é um objeto:
   { id, nome, categoria, encontrado }
   A lista fica salva no servidor (Flask + SQLite).
   As categorias vêm das opções do <select>, geradas pelo template.
   ============================================================ */
const API = '/api/materiais';
const CATEGORIAS = ['Todos', ...Array.from(document.getElementById('categorySelect').options, o => o.value)];

let materiais = [];   // array de materiais do usuário
let categoriaAtiva = 'Todos';
let termoBusca = '';

/* ============================================================
   COMUNICAÇÃO COM O BACKEND
   ============================================================ */
async function api(url, opcoes = {}){
  const resposta = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
  });
  if(!resposta.ok){
    const erro = await resposta.json().catch(() => ({}));
    throw new Error(erro.erro || `Erro ${resposta.status}`);
  }
  return resposta.status === 204 ? null : resposta.json();
}

async function executar(acao){
  try{
    await acao();
  }catch(e){
    console.error(e);
    alert('Não foi possível falar com o servidor: ' + e.message);
  }
  renderMateriais();
}

/* ============================================================
   CATEGORIAS (chips de filtro)
   ============================================================ */
const categoryRow = document.getElementById('categoryRow');

function renderCategorias(){
  categoryRow.innerHTML = '';
  CATEGORIAS.forEach(cat => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (cat === categoriaAtiva ? ' active' : '');
    chip.type = 'button';
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      categoriaAtiva = cat;
      renderCategorias();
      renderMateriais();
    });
    categoryRow.appendChild(chip);
  });
}

/* ============================================================
   ADICIONAR MATERIAL — via formulário
   ============================================================ */
const addForm = document.getElementById('addForm');
const materialInput = document.getElementById('materialInput');
const categorySelect = document.getElementById('categorySelect');

addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = materialInput.value.trim();
  if(!nome) return;

  executar(async () => {
    const novo = await api(API, {
      method: 'POST',
      body: { nome: nome, categoria: categorySelect.value }
    });
    materiais.push(novo);
    materialInput.value = '';
    materialInput.focus();
  });
});

/* ============================================================
   RENDERIZAÇÃO — grade de materiais
   ============================================================ */
const materialGrid = document.getElementById('materialGrid');

function renderMateriais(){
  materialGrid.innerHTML = '';

  const busca = termoBusca.trim().toLowerCase();

  const filtrados = materiais.filter(m => {
    const passaCategoria = categoriaAtiva === 'Todos' || m.categoria === categoriaAtiva;
    const passaBusca = m.nome.toLowerCase().includes(busca);
    return passaCategoria && passaBusca;
  });

  if(materiais.length === 0){
    const vazio = document.createElement('div');
    vazio.className = 'empty-state';
    vazio.textContent = 'Sua lista está vazia. Adicione um material acima para começar.';
    materialGrid.appendChild(vazio);
    atualizarProgresso();
    return;
  }

  if(filtrados.length === 0){
    const vazio = document.createElement('div');
    vazio.className = 'empty-state';
    vazio.textContent = 'Nenhum material da sua lista corresponde a essa pesquisa/filtro.';
    materialGrid.appendChild(vazio);
    atualizarProgresso();
    return;
  }

  filtrados.forEach(m => {
    const card = document.createElement('div');
    card.className = 'material-card' + (m.encontrado ? ' found' : '');

    card.innerHTML = `
      <div class="material-top">
        <div class="material-info">
          <p class="material-name"></p>
          <span class="material-category"></span>
        </div>
        <div class="card-buttons">
          <button class="check-btn" type="button" aria-label="Marcar como encontrado">
            <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <button class="remove-btn" type="button" aria-label="Remover material">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <span class="material-status">${m.encontrado ? 'Encontrado' : 'Ainda não encontrado'}</span>
    `;

    // nome e categoria são inseridos via textContent (evita problemas com o que o usuário digitou)
    card.querySelector('.material-name').textContent = m.nome;
    card.querySelector('.material-category').textContent = m.categoria;

    // clicar no nome/área de informação alterna o estado de encontrado
    card.querySelector('.material-info').addEventListener('click', () => alternarEncontrado(m.id));
    card.querySelector('.check-btn').addEventListener('click', () => alternarEncontrado(m.id));

    // remover material da lista
    card.querySelector('.remove-btn').addEventListener('click', () => removerMaterial(m.id));

    materialGrid.appendChild(card);
  });

  atualizarProgresso();
}

/* ============================================================
   AÇÕES
   ============================================================ */
function alternarEncontrado(id){
  const material = materiais.find(m => m.id === id);
  if(!material) return;

  executar(async () => {
    const atualizado = await api(`${API}/${id}`, {
      method: 'PATCH',
      body: { encontrado: !material.encontrado }
    });
    material.encontrado = atualizado.encontrado;
  });
}

function removerMaterial(id){
  executar(async () => {
    await api(`${API}/${id}`, { method: 'DELETE' });
    materiais = materiais.filter(m => m.id !== id);
  });
}

function marcarTodos(encontrado){
  executar(async () => {
    materiais = await api(API, { method: 'PATCH', body: { encontrado } });
  });
}

document.getElementById('btnMarkAll').addEventListener('click', () => marcarTodos(true));
document.getElementById('btnUnmarkAll').addEventListener('click', () => marcarTodos(false));

document.getElementById('btnReset').addEventListener('click', () => {
  if(materiais.length > 0 && !confirm('Isso vai apagar toda a sua lista de materiais. Continuar?')) return;

  executar(async () => {
    await api(API, { method: 'DELETE' });
    materiais = [];
    categoriaAtiva = 'Todos';
    termoBusca = '';
    document.getElementById('searchInput').value = '';
    renderCategorias();
  });
});

/* ============================================================
   BUSCA EM TEMPO REAL
   ============================================================ */
document.getElementById('searchInput').addEventListener('input', (e) => {
  termoBusca = e.target.value;
  renderMateriais();
});

/* ============================================================
   CONTADOR + BARRA DE PROGRESSO
   ============================================================ */
function atualizarProgresso(){
  const total = materiais.length;
  const total_encontrados = materiais.filter(m => m.encontrado).length;
  const percentual = total === 0 ? 0 : Math.round((total_encontrados / total) * 100);

  document.getElementById('counterText').innerHTML =
    `<strong>${total_encontrados}</strong> de ${total} materiais encontrados`;
  document.getElementById('percentText').textContent = `${percentual}%`;
  document.getElementById('progressFill').style.width = `${percentual}%`;
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
renderCategorias();
executar(async () => {
  materiais = await api(API);
});
