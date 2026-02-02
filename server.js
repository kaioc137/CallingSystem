const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// A fila agora guarda objetos: { nome: "João", setor: "lotacao", assunto: "Lotação de Professores" }
let filaDeEspera = []; 
let ultimoChamado = { name: "Bem-vindo", sector: "Aguarde", room: "" };

io.on('connection', (socket) => {
    // Envia dados iniciais
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaDeEspera);

    // 1. RECEPÇÃO ADICIONA (TRIAGEM)
    socket.on('add-to-queue', (dadosPessoa) => {
        // dadosPessoa = { nome: "Maria", setorCodigo: "lotacao", setorNome: "Lotação" }
        filaDeEspera.push(dadosPessoa);
        io.emit('update-queue', filaDeEspera);
    });

    // 2. SALA CHAMA (POR SETOR ESPECÍFICO)
    socket.on('request-next', (dadosSala) => {
        // Descobre o índice da primeira pessoa que está esperando para ESSE setor
        const index = filaDeEspera.findIndex(pessoa => pessoa.setorCodigo === dadosSala.setorCodigo);

        if (index > -1) {
            // Remove essa pessoa específica da fila (não necessariamente a primeira da lista geral)
            const pessoaChamada = filaDeEspera.splice(index, 1)[0];
            
            ultimoChamado = {
                name: pessoaChamada.nome,
                room: dadosSala.room,      // Ex: Sala A4
                sector: dadosSala.setorNome // Ex: Lotação
            };

            io.emit('update-call', ultimoChamado);
            io.emit('update-queue', filaDeEspera);
        } else {
            socket.emit('error-empty', 'Não há ninguém aguardando para o seu setor.');
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});