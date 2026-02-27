const socket = io();

// Variáveis de Estado
let currentClientId = null;
let config = { room: "", sectorCodigo: "", sectorNome: "" };
let minhaFilaIds = []; // <--- NOVO: Guarda os IDs de quem já estava na fila

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
configSelect.addEventListener('change', () => {
    const valor = configSelect.value;
    if (valor) {
        const parts = valor.split('|'); 
        config.sectorCodigo = parts[0];
        config.room = parts[1];
        config.sectorNome = parts[2];
        
        if(btnChamar) btnChamar.disabled = false;
        if(btnRepetir) btnRepetir.disabled = false;
        
        // Reseta a memória da fila ao trocar de sala
        minhaFilaIds = []; 
        socket.emit('ping-keep-alive'); 
        alert(`Sala configurada: ${config.room}\nAtendendo: ${config.sectorNome}`);
    } else {
        if(btnChamar) btnChamar.disabled = true;
        if(btnRepetir) btnRepetir.disabled = true;
        config.sectorCodigo = "";
    }
});

// --- 2. AÇÃO DOS BOTÕES ---
if(btnChamar) {
    btnChamar.addEventListener('click', () => {
        if (!config.sectorCodigo) return alert("Selecione sua sala no menu acima primeiro!");
        socket.emit('request-next', { setorCodigo: config.sectorCodigo, setorNome: config.sectorNome, room: config.room });
    });
}

if(btnRepetir) {
    btnRepetir.addEventListener('click', () => {
        if (!config.sectorCodigo) return alert("Configure a sala primeiro!");
        socket.emit('repeat-call');
    });
}

// --- 3. NOTIFICAÇÕES (SOM E VISUAL) ---

// Função chamada pelo botão no HTML
window.ativarNotificacoes = function() {
    if (Notification.permission !== "granted") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                alert("Notificações ativadas com sucesso!");
                document.getElementById('btnNotificacao').style.background = "#2ecc71"; // Fica verde
                document.getElementById('btnNotificacao').innerText = "🔔 Alertas Ativos";
            }
        });
    } else {
        alert("As notificações já estão ativadas para este site.");
    }
}

function tocarBipe() {
    try {
        // Cria um som de "Ding-Dong" eletrônico profissional sem precisar de MP3
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
        gain.gain.setValueAtTime(0.1, ctx.currentTime); // Volume (0.1 é suave)
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.50, ctx.currentTime + 0.15); // Nota C6
        gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.15);
        osc2.start(ctx.currentTime + 0.15);
        osc2.stop(ctx.currentTime + 0.25);
    } catch(e) { console.log("Áudio não suportado ou bloqueado."); }
}

function mostrarNotificacao(nomePaciente) {
    if (Notification.permission === 'granted') {
        const notif = new Notification('Novo Paciente na Fila', {
            body: `${nomePaciente} acabou de chegar para atendimento.`,
            icon: 'https://cdn-icons-png.flaticon.com/512/2910/2910791.png' // Ícone genérico de alerta
        });
        
        // Fecha a notificação automaticamente após 5 segundos
        setTimeout(() => notif.close(), 5000);
    }
}

// --- 4. ATUALIZAÇÕES DO SERVIDOR ---
socket.on('update-queue', (listaGeral) => {
    if (!config.sectorCodigo) return;

    const minhaFila = listaGeral.filter(p => p.setorCodigo === config.sectorCodigo);
    
    // VERIFICA SE ALGUÉM NOVO ENTROU
    const novosIds = minhaFila.map(p => p._id);
    const temGenteNova = minhaFila.filter(p => !minhaFilaIds.includes(p._id));

    // Se tiver gente nova E não for a primeira vez carregando a página
    if (temGenteNova.length > 0 && minhaFilaIds.length > 0) {
        tocarBipe(); // Toca o som
        temGenteNova.forEach(pessoa => mostrarNotificacao(pessoa.nome)); // Mostra a janelinha
    }
    
    // Atualiza a memória
    minhaFilaIds = novosIds;

    // Atualiza a tela
    if(elMyQueueCount) elMyQueueCount.innerText = minhaFila.length;
    if(elMySectorList) {
        elMySectorList.innerHTML = ''; 
        minhaFila.forEach(pessoa => {
            const li = document.createElement('li');
            li.className = 'queue-item'; 
            const icone = pessoa.prioridade ? '⭐' : '👤';
            li.innerHTML = `<span style="font-weight:bold;">${icone} ${pessoa.nome}</span> <span style="font-size:0.8rem; color:#666;">(Chegou: ${new Date(pessoa.dataChegada).toLocaleTimeString().slice(0,5)})</span>`;
            elMySectorList.appendChild(li);
        });
    }
});

socket.on('update-call', (data) => {
    if (!elCurrentName) return;
    if (data.name !== "BEM-VINDO") {
        elCurrentName.innerText = data.name;
        currentClientId = data.id;
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

socket.on('error-empty', (msg) => alert(msg));

// --- 5. TRANSFERÊNCIA E CARREGAMENTO DINÂMICO ---
window.transferirCliente = function() {
    if (!transferSelect) return;
    const valor = transferSelect.value;
    if (!currentClientId) return alert("Não há ninguém sendo atendido agora para transferir.");
    if (!valor) return alert("Selecione um setor de destino!");

    let novoCodigo = valor;
    let novoNome = valor.toUpperCase();
    if (valor.includes('|')) {
        const parts = valor.split('|');
        novoCodigo = parts[0];
        novoNome = parts[1];
    }

    if (confirm(`Deseja transferir este cliente para ${novoNome}?`)) {
        socket.emit('transfer-client', { id: currentClientId, novoSetorCodigo: novoCodigo, novoSetorNome: novoNome });
        transferSelect.value = "";
        if(transferArea) transferArea.style.display = 'none';
        elCurrentName.innerText = "--- (Transferido)";
        currentClientId = null;
        alert("Cliente transferido!");
    }
};

async function carregarOpcoesSala() {
    try {
        const res = await fetch('/api/config/setores');
        if (!res.ok) return;
        const setores = await res.json();
        
        if (setores && setores.length > 0) {
            if(configSelect) {
                configSelect.innerHTML = '<option value="">Selecione sua sala...</option>';
                setores.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = `${s.codigo}|${s.sala}|${s.nome}`;
                    opt.innerText = `${s.sala} (${s.nome})`;
                    configSelect.appendChild(opt);
                });
            }
            if(transferSelect) {
                transferSelect.innerHTML = '<option value="">Selecione um destino...</option>';
                setores.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = `${s.codigo}|${s.nome}`;
                    opt.innerText = s.nome;
                    transferSelect.appendChild(opt);
                });
            }
        }
    } catch (e) { console.log("Erro ao carregar setores API."); }
}

carregarOpcoesSala();