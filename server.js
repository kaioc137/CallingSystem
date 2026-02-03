const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let filaDeEspera = []; 
let ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };

io.on('connection', (socket) => {
    // Envia dados iniciais
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaDeEspera);

    socket.on('ping-keep-alive', () => {
    // Apenas recebe o sinal para manter a conexão ativa
    console.log("Ping recebido, mantendo servidor acordado.");
    });

    // 1. RECEPÇÃO ADICIONA (Com Uppercase forçado)
    socket.on('add-to-queue', (dadosPessoa) => {
        // Força o nome a ser maiúsculo aqui no servidor para garantir
        dadosPessoa.nome = dadosPessoa.nome.toUpperCase();
        
        filaDeEspera.push(dadosPessoa);
        io.emit('update-queue', filaDeEspera);
    });

    // 2. SALA CHAMA
    socket.on('request-next', (dadosSala) => {
        const index = filaDeEspera.findIndex(pessoa => pessoa.setorCodigo === dadosSala.setorCodigo);

        if (index > -1) {
            const pessoaChamada = filaDeEspera.splice(index, 1)[0];
            
            ultimoChamado = {
                name: pessoaChamada.nome,
                room: dadosSala.room,
                sector: dadosSala.setorNome,
                isRepeat: false // Marca como chamado novo
            };

            io.emit('update-call', ultimoChamado);
            io.emit('update-queue', filaDeEspera);
        } else {
            socket.emit('error-empty', 'Não há ninguém aguardando para o seu setor.');
        }
    });

    // 3. REPETIR CHAMADA (NOVO)
    socket.on('repeat-call', () => {
        if (ultimoChamado.name !== "BEM-VINDO") {
            // Reenvia o mesmo dado, mas com flag de repetição
            io.emit('update-call', { ...ultimoChamado, isRepeat: true });
        }
    });
});

const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});