const socket = io();
const nameInput = document.getElementById('nameInput');
const sectorInput = document.getElementById('sectorInput');
const priorityInput = document.getElementById('priorityInput'); // Checkbox
const queueList = document.getElementById('queueList');
const restoreArea = document.getElementById('restoreArea');

setInterval(() => { socket.emit('ping-keep-alive'); }, 1000 * 60 * 5);

// --- 1. CARREGAR SETORES DINAMICAMENTE ---
async function carregarOpcoesRecepcao() {
    try {
        const res = await fetch('/api/config/setores');
        const setores = await res.json();
        
        sectorInput.innerHTML = '<option value="">Selecione o Setor...</option>'; 

        setores.forEach(s => {
            const opt = document.createElement('option');
            // Formato: codigo|Nome do Setor
            opt.value = `${s.codigo}|${s.nome}`;
            opt.innerText = `${s.nome} (${s.sala})`;
            sectorInput.appendChild(opt);
        });
    } catch (e) {
        console.error("Erro ao carregar setores:", e);
    }
}

// Chama a função assim que a página carrega
carregarOpcoesRecepcao();

// --- 2. ADICIONAR PESSOA (CORRIGIDO) ---
function addPerson() {
    const nome = nameInput.value.trim().toUpperCase();
    const valorSelecionado = sectorInput.value; // Pega o valor (Ex: "estagio|SETOR DE ESTÁGIO")
    const prioridade = priorityInput.checked; 

    // Só adiciona se tiver digitado um nome E selecionado um setor
    if (nome && valorSelecionado) {
        
        // Separa o código e o nome que vieram juntos no value
        const parts = valorSelecionado.split('|');
        const codigo = parts[0]; // "estagio"
        const nomeSetor = parts[1]; // "SETOR DE ESTÁGIO"

        // Envia os dados certinhos para o servidor
        socket.emit('add-to-queue', { 
            nome: nome, 
            setorCodigo: codigo, 
            setorNome: nomeSetor, 
            prioridade: prioridade 
        });
        
        nameInput.value = '';
        priorityInput.checked = false; 
        nameInput.focus();
    } else if (!valorSelecionado) {
        alert("Por favor, selecione um setor!");
    }
}

function removePerson(idMongo) {
    if(confirm('Remover esta pessoa?')) {
        socket.emit('remove-from-queue', idMongo);
    }
}

nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") addPerson(); });

// --- 3. ATUALIZAR FILA NA TELA ---
socket.on('update-queue', (lista) => {
    document.getElementById('count').innerText = lista.length;
    queueList.innerHTML = "";
    
    lista.forEach((pessoa, i) => {
        const li = document.createElement('li');
        const iconPrioridade = pessoa.prioridade ? '<span class="badge-priority">⭐ PRIORIDADE</span>' : '';
        
        li.innerHTML = `
            <div class="info-container">
                <strong>${i + 1}.</strong> ${pessoa.nome} ${iconPrioridade}
                <span class="tag ${pessoa.setorCodigo}">${pessoa.setorNome}</span>
            </div>
            <button class="btn-trash" onclick="removePerson('${pessoa._id}')">🗑️</button>
        `;
        queueList.appendChild(li);
    });

    // Backup Automático
    if (lista.length > 0) {
        localStorage.setItem('backupFila', JSON.stringify(lista));
        restoreArea.style.display = 'none';
    } else {
        const backup = localStorage.getItem('backupFila');
        if (backup && JSON.parse(backup).length > 0) restoreArea.style.display = 'block';
    }
});

function restoreQueue() {
    const backup = localStorage.getItem('backupFila');
    if (backup) {
        socket.emit('restore-queue', JSON.parse(backup));
        restoreArea.style.display = 'none';
    }
}

function ignoreBackup() {
    localStorage.removeItem('backupFila');
    restoreArea.style.display = 'none';
}