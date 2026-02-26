const socket = io();

// Variáveis de Estado
let currentClientId = null;
let config = {
    room: "",
    sectorCodigo: "",
    sectorNome: ""
};

// Elementos do DOM
const btnChamar = document.getElementById('btnChamar');
const btnRepetir = document.getElementById('btnRepetir');
const configSelect = document.getElementById('configSelect');
const elCurrentName = document.getElementById('currentName');
const transferArea = document.getElementById('transferArea');
const transferSelect = document.getElementById('transferSelect');
const elMyQueueCount = document.getElementById('myQueueCount');
const elMySectorList = document.getElementById('mySectorList');

// --- 1. CONFIGURAÇÃO DA SALA ---
// Quando o médico seleciona "SALA A1" no menu
configSelect.addEventListener('change', () => {
    const valor = configSelect.value;
    
    if (valor) {
        // Formato esperado: "codigo|sala|nome"
        // Ex: "estagio|RECEPÇÃO|SETOR DE ESTÁGIO"
        const parts = valor.split('|'); 
        config.sectorCodigo = parts[0];
        config.room = parts[1];
        config.sectorNome = parts[2];
        
        // Habilita os botões
        if(btnChamar) btnChamar.disabled = false;
        if(btnRepetir) btnRepetir.disabled = false;
        
        // Pede a fila atualizada para o servidor para já preencher a lista
        socket.emit('ping-keep-alive'); 
        
        alert(`Sala configurada: ${config.room}\nAtendendo: ${config.sectorNome}`);
    } else {
        if(btnChamar) btnChamar.disabled = true;
        if(btnRepetir) btnRepetir.disabled = true;
        config.sectorCodigo = "";
    }
});

// --- 2. AÇÃO DOS BOTÕES ---

// Botão CHAMAR PRÓXIMO
if(btnChamar) {
    btnChamar.addEventListener('click', () => {
        if (!config.sectorCodigo) return alert("Selecione sua sala no menu acima primeiro!");
        
        socket.emit('request-next', {
            setorCodigo: config.sectorCodigo,
            setorNome: config.sectorNome,
            room: config.room
        });
    });
}

// Botão REPETIR
if(btnRepetir) {
    btnRepetir.addEventListener('click', () => {
        if (!config.sectorCodigo) return alert("Configure a sala primeiro!");
        socket.emit('repeat-call');
    });
}

// --- 3. ATUALIZAÇÕES DO SERVIDOR (SOCKET) ---

// A. Recebe a FILA e filtra apenas o meu setor
socket.on('update-queue', (listaGeral) => {
    // Se não configurou a sala ainda, não mostra nada
    if (!config.sectorCodigo) return;

    // 1. Filtra: Só quero ver quem é do meu setor (config.sectorCodigo)
    const minhaFila = listaGeral.filter(p => p.setorCodigo === config.sectorCodigo);

    // 2. Atualiza o Contador
    if(elMyQueueCount) elMyQueueCount.innerText = minhaFila.length;

    // 3. Atualiza a Lista Visual (UL)
    if(elMySectorList) {
        elMySectorList.innerHTML = ''; // Limpa a lista atual
        
        minhaFila.forEach(pessoa => {
            const li = document.createElement('li');
            li.className = 'queue-item'; // Classe para estilizar no CSS se quiser
            
            // Ícone de prioridade
            const icone = pessoa.prioridade ? '⭐' : '👤';
            
            li.innerHTML = `
                <span style="font-weight:bold;">${icone} ${pessoa.nome}</span>
                <span style="font-size:0.8rem; color:#666;">(Chegou: ${new Date(pessoa.dataChegada).toLocaleTimeString().slice(0,5)})</span>
            `;
            elMySectorList.appendChild(li);
        });
    }
});

// B. Recebe a confirmação de quem foi chamado (Para mostrar na tela grande)
socket.on('update-call', (data) => {
    if (!elCurrentName) return;

    if (data.name !== "BEM-VINDO") {
        elCurrentName.innerText = data.name;
        currentClientId = data.id;

        // Só mostra o menu de transferir se o chamado for DESTA sala
        if (data.room === config.room) {
            if(transferArea) transferArea.style.display = 'block';
        } else {
            if(transferArea) transferArea.style.display = 'none';
        }
    } else {
        elCurrentName.innerText = "---";
        currentClientId = null;
        if(transferArea) transferArea.style.display = 'none';
    }
});

// C. Erros (ex: Fila vazia)
socket.on('error-empty', (msg) => {
    alert(msg);
});

// --- 4. FUNÇÃO DE TRANSFERÊNCIA ---
window.transferirCliente = function() {
    if (!transferSelect) return;
    const valor = transferSelect.value;
    
    if (!currentClientId) {
        alert("Não há ninguém sendo atendido agora para transferir.");
        return;
    }
    if (!valor) {
        alert("Selecione um setor de destino!");
        return;
    }

    // O select pode vir do banco (codigo) ou manual (codigo|Nome)
    // Vamos assumir formato manual value="codigo|Nome"
    let novoCodigo = valor;
    let novoNome = valor.toUpperCase();

    if (valor.includes('|')) {
        const parts = valor.split('|');
        novoCodigo = parts[0];
        novoNome = parts[1];
    }

    if (confirm(`Deseja transferir este cliente para ${novoNome}?`)) {
        socket.emit('transfer-client', {
            id: currentClientId,
            novoSetorCodigo: novoCodigo,
            novoSetorNome: novoNome
        });
        
        // Limpa a tela
        transferSelect.value = "";
        if(transferArea) transferArea.style.display = 'none';
        elCurrentName.innerText = "--- (Transferido)";
        currentClientId = null;
        alert("Cliente transferido!");
    }
};

// --- 5. CARREGAMENTO INICIAL DE OPÇÕES (SISTEMA DINÂMICO) ---
async function carregarOpcoesSala() {
    try {
        const res = await fetch('/api/config/setores');
        if (!res.ok) return; // Se der erro na API, mantém o HTML original
        
        const setores = await res.json();
        
        // Se a API retornou setores, limpa o select manual e preenche com os do banco
        if (setores && setores.length > 0) {
            // 1. Select de Configuração
            if(configSelect) {
                configSelect.innerHTML = '<option value="">Selecione sua sala...</option>';
                setores.forEach(s => {
                    const opt = document.createElement('option');
                    // Formato: codigo|sala|nome
                    opt.value = `${s.codigo}|${s.sala}|${s.nome}`;
                    opt.innerText = `${s.sala} (${s.nome})`;
                    configSelect.appendChild(opt);
                });
            }

            // 2. Select de Transferência
            if(transferSelect) {
                transferSelect.innerHTML = '<option value="">Selecione um destino...</option>';
                setores.forEach(s => {
                    const opt = document.createElement('option');
                    // Formato: codigo|Nome
                    opt.value = `${s.codigo}|${s.nome}`;
                    opt.innerText = s.nome;
                    transferSelect.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.log("Usando configuração manual (API não respondeu ou sem setores).");
    }
}

// Inicia
carregarOpcoesSala();