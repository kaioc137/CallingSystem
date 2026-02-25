const socket = io();

// Variáveis de Estado
let currentClientId = null; // Guarda o ID do paciente atual para transferência
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

// 1. Configuração da Sala (Ao mudar o select)
configSelect.addEventListener('change', () => {
    const valor = configSelect.value;
    if (valor) {
        const parts = valor.split('|'); // Ex: "estagio|SALA 1|ESTÁGIO"
        config.sectorCodigo = parts[0];
        config.room = parts[1];
        config.sectorNome = parts[2];
        
        // Habilita os botões
        btnChamar.disabled = false;
        btnRepetir.disabled = false;
        
        alert(`Sala configurada: ${config.room} - ${config.sectorNome}`);
    } else {
        btnChamar.disabled = true;
        btnRepetir.disabled = true;
    }
});

// 2. Botão Chamar Próximo
btnChamar.addEventListener('click', () => {
    if (!config.sectorCodigo) return alert("Selecione sua sala primeiro!");
    
    socket.emit('request-next', {
        setorCodigo: config.sectorCodigo,
        setorNome: config.sectorNome,
        room: config.room
    });
});

// 3. Botão Repetir Chamada
btnRepetir.addEventListener('click', () => {
    socket.emit('repeat-call');
});

// --- AQUI ESTÁ O QUE FALTAVA ---
// 4. Recebe a confirmação de quem foi chamado (Atualiza a tela do atendente)
socket.on('update-call', (data) => {
    // data = { id, name, room, sector, prioridade, isRepeat }

    if (data.name !== "BEM-VINDO") {
        // Alguém foi chamado!
        elCurrentName.innerText = data.name;
        
        // Salva o ID para caso queira transferir
        currentClientId = data.id;

        // LÓGICA DE EXIBIÇÃO DA TRANSFERÊNCIA:
        // Só mostra o menu de transferir se o chamado for DESTA sala
        // (Para evitar que a tela da Recepção mostre o botão de transferir da Diretoria)
        if (data.room === config.room) {
            if(transferArea) transferArea.style.display = 'block';
        } else {
            // Se for chamado de outra sala, esconde o painel de transferência
            if(transferArea) transferArea.style.display = 'none';
        }

    } else {
        // Ninguém sendo atendido (sistema reiniciado ou fila limpa)
        elCurrentName.innerText = "---";
        currentClientId = null;
        if(transferArea) transferArea.style.display = 'none';
    }
});

socket.on('error-empty', (msg) => {
    alert(msg);
});

// 5. Função de Transferir Cliente
function transferirCliente() { // Essa função é chamada pelo onclick do botão HTML
    const valor = transferSelect.value; // Ex: "diretoria|DIRETORIA DO DGRH"
    
    if (!currentClientId) {
        alert("Não há ninguém sendo atendido agora para transferir.");
        return;
    }
    if (!valor) {
        alert("Selecione um setor de destino!");
        return;
    }

    // O valor do select vem como "codigo|Nome" (ajuste conforme seu HTML)
    // Se o seu HTML for value="diretoria|DIRETORIA", usamos split
    // Se for só value="diretoria", precisa ajustar aqui.
    // Assumindo formato: codigo|NomeLegivel
    
    const parts = valor.split('|');
    const novoCodigo = parts[0];
    const novoNome = parts[1] || parts[0].toUpperCase(); // Fallback se não tiver nome

    if (confirm(`Deseja transferir este cliente para ${novoNome}?`)) {
        socket.emit('transfer-client', {
            id: currentClientId,
            novoSetorCodigo: novoCodigo,
            novoSetorNome: novoNome
        });
        
        // Limpa a seleção e esconde
        transferSelect.value = "";
        transferArea.style.display = 'none';
        elCurrentName.innerText = "--- (Transferido)";
        currentClientId = null;
        
        alert("Cliente transferido com sucesso!");
    }
}

// Torna a função global para o HTML conseguir chamar via onclick="..."
window.transferirCliente = transferirCliente;