const socket = io();

const elBigName = document.getElementById('bigName');
const elBigLoc = document.getElementById('bigLoc');
const elList = document.getElementById('mobileList');
let ultimoNomeChamado = "";

// Manter conexão viva
setInterval(() => { socket.emit('ping-keep-alive'); }, 1000 * 60 * 5);

// 1. Atualiza Quem está sendo chamado (Header)
socket.on('update-call', (data) => {
    elBigName.innerText = data.name;
    elBigLoc.innerText = `${data.room} - ${data.sector}`;

    // Se mudou o nome e não é "BEM-VINDO", vibra o celular
    if (data.name !== "BEM-VINDO" && data.name !== ultimoNomeChamado) {
        ultimoNomeChamado = data.name;
        // Vibra: 200ms
        if (navigator.vibrate) navigator.vibrate(200);
    }
});

// 2. Atualiza a Lista de Espera (Abaixo)
socket.on('update-queue', (lista) => {
    elList.innerHTML = "";

    if (lista.length === 0) {
        elList.innerHTML = '<li class="loading">Ninguém na fila.</li>';
        return;
    }

    lista.forEach((pessoa, index) => {
        const li = document.createElement('li');
        if (pessoa.prioridade) li.classList.add('prioridade');

        const icone = pessoa.prioridade ? '⭐' : `${index + 1}.`;
        
        li.innerHTML = `
            <span class="nome-fila">${icone} ${pessoa.nome}</span>
            <span class="setor-fila">${pessoa.setorNome}</span>
        `;
        elList.appendChild(li);
    });
});