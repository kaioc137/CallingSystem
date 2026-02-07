require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- 1. CONFIGURAÇÃO DO BANCO (Apenas define a variável aqui) ---
// Tenta pegar do Render (process.env) OU usa a string local para testes
const mongoURI = process.env.MONGO_URI || "mongodb+srv://SEU_USUARIO:SUA_SENHA@cluster0.mongodb.net/?retryWrites=true&w=majority";

// --- 2. MODELO DE DADOS ---
const ClienteSchema = new mongoose.Schema({
    nome: String,
    setorCodigo: String,
    setorNome: String,
    prioridade: Boolean,
    status: { type: String, default: 'aguardando' },
    dataChegada: { type: Date, default: Date.now },
    dataAtendimento: Date,
    salaAtendimento: String
});

const Cliente = mongoose.model('Cliente', ClienteSchema);

// --- 3. MEMÓRIA ---
let historicoChamadas = [];
let ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };

async function carregarFilaDoBanco() {
    try {
        const filaBanco = await Cliente.find({ status: 'aguardando' }).sort({ dataChegada: 1 });
        return reordenarPorPrioridade(filaBanco);
    } catch (error) {
        console.error("Erro ao carregar fila:", error);
        return [];
    }
}

function reordenarPorPrioridade(lista) {
    const normais = [];
    const prioridades = [];
    lista.forEach(c => c.prioridade ? prioridades.push(c) : normais.push(c));
    return [...prioridades, ...normais];
}

// --- 4. SOCKET.IO ---
io.on('connection', async (socket) => {
    const filaAtual = await carregarFilaDoBanco();
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaAtual);
    socket.emit('update-history', historicoChamadas);

    socket.on('ping-keep-alive', () => {});

    socket.on('add-to-queue', async (dados) => {
        if (!dados || !dados.nome) return;
        try {
            await Cliente.create({
                nome: String(dados.nome).toUpperCase(),
                setorCodigo: dados.setorCodigo,
                setorNome: dados.setorNome,
                prioridade: dados.prioridade
            });
            const filaAtualizada = await carregarFilaDoBanco();
            io.emit('update-queue', filaAtualizada);
        } catch (erro) { console.error("Erro ao adicionar:", erro); }
    });

    socket.on('remove-from-queue', async (idMongo) => {
        try {
            await Cliente.findByIdAndUpdate(idMongo, { status: 'cancelado' });
            const filaAtualizada = await carregarFilaDoBanco();
            io.emit('update-queue', filaAtualizada);
        } catch (erro) { console.error("Erro ao remover:", erro); }
    });

    socket.on('request-next', async (dadosSala) => {
        try {
            const filaAtual = await carregarFilaDoBanco();
            const clienteParaChamar = filaAtual.find(p => p.setorCodigo === dadosSala.setorCodigo);

            if (clienteParaChamar) {
                clienteParaChamar.status = 'atendido';
                clienteParaChamar.dataAtendimento = new Date();
                clienteParaChamar.salaAtendimento = dadosSala.room;
                await clienteParaChamar.save();

                ultimoChamado = {
                    name: clienteParaChamar.nome,
                    room: dadosSala.room,
                    sector: dadosSala.setorNome,
                    prioridade: clienteParaChamar.prioridade,
                    isRepeat: false
                };

                historicoChamadas.unshift({ ...ultimoChamado });
                if (historicoChamadas.length > 3) historicoChamadas.pop();

                const novaFila = await carregarFilaDoBanco();
                io.emit('update-call', ultimoChamado);
                io.emit('update-history', historicoChamadas);
                io.emit('update-queue', novaFila);
            } else {
                socket.emit('error-empty', 'Ninguém aguardando para este setor.');
            }
        } catch (erro) { console.error("Erro ao chamar:", erro); }
    });

    socket.on('repeat-call', () => {
        if (ultimoChamado.name !== "BEM-VINDO") {
            io.emit('update-call', { ...ultimoChamado, isRepeat: true });
        }
    });
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalAtendidos = await Cliente.countDocuments({ status: 'atendido' });
        const totalFila = await Cliente.countDocuments({ status: 'aguardando' });
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const atendidosHoje = await Cliente.find({ status: 'atendido', dataAtendimento: { $gte: hoje } });
        let tempoTotal = 0;
        atendidosHoje.forEach(c => { tempoTotal += (c.dataAtendimento - c.dataChegada); });
        const mediaMinutos = atendidosHoje.length > 0 ? Math.floor((tempoTotal / atendidosHoje.length) / 60000) : 0;
        res.json({ totalAtendidos, totalFila, mediaMinutos, atendidosHoje: atendidosHoje.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;

// --- 5. INICIALIZAÇÃO SEGURA (BANCO ANTES DO SERVIDOR) ---
console.log("⏳ Tentando conectar ao MongoDB...");

mongoose.connect(mongoURI)
    .then(() => {
        console.log('✅ Conectado ao MongoDB com sucesso!');
        server.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ ERRO CRÍTICO AO CONECTAR NO MONGO:', err);
    });