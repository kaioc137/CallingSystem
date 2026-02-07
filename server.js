const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ESTADO DO SISTEMA
let filaDeEspera = []; 
let historicoChamadas = []; // Guarda os últimos 3
let ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };

io.on('connection', (socket) => {
    // 1. Envia tudo ao conectar
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaDeEspera);
    socket.emit('update-history', historicoChamadas);

    // Keep-Alive
    socket.on('ping-keep-alive', () => {});

    // 2. ADICIONAR (COM LÓGICA DE PRIORIDADE CORRIGIDA)
    socket.on('add-to-queue', (dadosPessoa) => {
        if (!dadosPessoa || !dadosPessoa.nome) return;

        try {
            dadosPessoa.nome = String(dadosPessoa.nome).toUpperCase();
            
            // LÓGICA DE PRIORIDADE (COMPATÍVEL COM QUALQUER NODE.JS)
            if (dadosPessoa.prioridade) {
                // Em vez de findLastIndex, vamos procurar manualmente de trás pra frente
                let ultimoPrioritarioIndex = -1;
                
                for (let i = filaDeEspera.length - 1; i >= 0; i--) {
                    if (filaDeEspera[i].prioridade) {
                        ultimoPrioritarioIndex = i;
                        break; // Achou o último prioridade, para o loop
                    }
                }
                
                if (ultimoPrioritarioIndex === -1) {
                    // Nenhuma prioridade na fila, entra no topo
                    filaDeEspera.unshift(dadosPessoa);
                } else {
                    // Entra logo após a última prioridade encontrada
                    filaDeEspera.splice(ultimoPrioritarioIndex + 1, 0, dadosPessoa);
                }
            } else {
                // Normal: vai para o fim da fila
                filaDeEspera.push(dadosPessoa);
            }

            io.emit('update-queue', filaDeEspera);
        } catch (erro) {
            console.error("Erro ao adicionar:", erro);
        }
    });

    // 3. REMOVER (LIXEIRA)
    socket.on('remove-from-queue', (index) => {
        if (index >= 0 && index < filaDeEspera.length) {
            filaDeEspera.splice(index, 1);
            io.emit('update-queue', filaDeEspera);
        }
    });

    // 4. CHAMAR PRÓXIMO + HISTÓRICO
    socket.on('request-next', (dadosSala) => {
        if (!dadosSala || !dadosSala.setorCodigo) return;

        const index = filaDeEspera.findIndex(pessoa => pessoa.setorCodigo === dadosSala.setorCodigo);

        if (index > -1) {
            const pessoaChamada = filaDeEspera.splice(index, 1)[0];
            
            ultimoChamado = {
                name: pessoaChamada.nome,
                room: dadosSala.room,
                sector: dadosSala.setorNome,
                isRepeat: false,
                prioridade: pessoaChamada.prioridade // Passa a info se é prioridade
            };

            // Atualiza Histórico (Mantém apenas os últimos 3)
            historicoChamadas.unshift({ ...ultimoChamado }); 
            if (historicoChamadas.length > 3) historicoChamadas.pop();

            io.emit('update-call', ultimoChamado);
            io.emit('update-history', historicoChamadas);
            io.emit('update-queue', filaDeEspera);
        } else {
            socket.emit('error-empty', 'Não há ninguém aguardando para o seu setor.');
        }
    });

    // 5. REPETIR
    socket.on('repeat-call', () => {
        if (ultimoChamado.name !== "BEM-VINDO") {
            io.emit('update-call', { ...ultimoChamado, isRepeat: true });
        }
    });

    // 6. RESTAURAR BACKUP
    socket.on('restore-queue', (listaBackup) => {
        if (Array.isArray(listaBackup)) {
            filaDeEspera = listaBackup;
            io.emit('update-queue', filaDeEspera);
        }
    });
});

const PORT = process.env.PORT || 3000; 
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));