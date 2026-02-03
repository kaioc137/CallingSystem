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
        // Comentei o log para não poluir seu terminal, já que roda a cada 5 min
        // console.log("Ping recebido, mantendo servidor acordado.");
    });

    // 1. RECEPÇÃO ADICIONA (BLINDADO)
    socket.on('add-to-queue', (dadosPessoa) => {
        // SEGURANÇA CRÍTICA: Verifica se os dados existem antes de processar
        if (!dadosPessoa || !dadosPessoa.nome) {
            console.error("Tentativa de cadastro inválida recebida (nome vazio ou nulo).");
            return; // Cancela a operação e salva o servidor de cair
        }

        try {
            // Garante que é string antes de dar UpperCase
            dadosPessoa.nome = String(dadosPessoa.nome).toUpperCase();
            
            filaDeEspera.push(dadosPessoa);
            io.emit('update-queue', filaDeEspera);
        } catch (erro) {
            console.error("Erro ao processar adição na fila:", erro);
        }
    });

    // 2. SALA CHAMA (BLINDADO)
    socket.on('request-next', (dadosSala) => {
        // Segurança: verifica se o setor veio corretamente
        if (!dadosSala || !dadosSala.setorCodigo) {
            console.error("Requisição de chamada inválida (sem código de setor).");
            return;
        }

        try {
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
        } catch (erro) {
            console.error("Erro ao processar chamada de senha:", erro);
        }
    });

    // 3. REPETIR CHAMADA
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