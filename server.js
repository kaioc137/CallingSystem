require('dotenv').config(); // Carrega variáveis de ambiente
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

// --- 1. CONEXÃO COM BANCO DE DADOS (MongoDB) ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://SEU_USUARIO:SUA_SENHA@cluster0.mongodb.net/?retryWrites=true&w=majority";

mongoose.connect(mongoURI)
    .then(() => console.log('✅ Conectado ao MongoDB!'))
    .catch(err => console.error('❌ Erro no MongoDB:', err));

// --- 2. MODELO DE DADOS (Schema) ---
const ClienteSchema = new mongoose.Schema({
    nome: String,
    setorCodigo: String,
    setorNome: String,
    prioridade: Boolean,
    status: { type: String, default: 'aguardando' }, // aguardando, atendido, cancelado
    dataChegada: { type: Date, default: Date.now },
    dataAtendimento: Date,
    salaAtendimento: String
});

const Cliente = mongoose.model('Cliente', ClienteSchema);

// --- 3. VARIÁVEIS DE MEMÓRIA (Cache Rápido) ---
let historicoChamadas = [];
let ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };

// Função auxiliar para carregar a fila do Banco ao iniciar
async function carregarFilaDoBanco() {
    try {
        // Busca apenas quem NÃO foi atendido ainda, ordenado por chegada
        const filaBanco = await Cliente.find({ status: 'aguardando' }).sort({ dataChegada: 1 });
        
        // Reorganiza a fila considerando a prioridade (Lei)
        // O banco traz por data, mas precisamos garantir que prioridades furem a fila visualmente
        const filaOrdenada = reordenarPorPrioridade(filaBanco);
        return filaOrdenada;
    } catch (error) {
        console.error("Erro ao carregar fila:", error);
        return [];
    }
}

// Lógica de Ordenação (Mesma lógica do seu código anterior, mas aplicada à lista do banco)
function reordenarPorPrioridade(lista) {
    const normais = [];
    const prioridades = [];
    lista.forEach(c => c.prioridade ? prioridades.push(c) : normais.push(c));
    return [...prioridades, ...normais];
}

// --- 4. SOCKET.IO ---
io.on('connection', async (socket) => {
    // Ao conectar, manda a fila atualizada do BANCO
    const filaAtual = await carregarFilaDoBanco();
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaAtual);
    socket.emit('update-history', historicoChamadas);

    socket.on('ping-keep-alive', () => {});

    // ADICIONAR
    socket.on('add-to-queue', async (dados) => {
        if (!dados || !dados.nome) return;
        try {
            // 1. Salva no Banco
            const novoCliente = await Cliente.create({
                nome: String(dados.nome).toUpperCase(),
                setorCodigo: dados.setorCodigo,
                setorNome: dados.setorNome,
                prioridade: dados.prioridade
            });

            // 2. Atualiza a fila para todos
            const filaAtualizada = await carregarFilaDoBanco();
            io.emit('update-queue', filaAtualizada);
            
        } catch (erro) { console.error("Erro ao adicionar:", erro); }
    });

    // REMOVER (CANCELAR)
    socket.on('remove-from-queue', async (idMongo) => {
        try {
            // Marca como cancelado no banco (não apaga, para estatística futura de desistência)
            await Cliente.findByIdAndUpdate(idMongo, { status: 'cancelado' });
            
            const filaAtualizada = await carregarFilaDoBanco();
            io.emit('update-queue', filaAtualizada);
        } catch (erro) { console.error("Erro ao remover:", erro); }
    });

    // CHAMAR PRÓXIMO
    socket.on('request-next', async (dadosSala) => {
        try {
            const filaAtual = await carregarFilaDoBanco();
            
            // Encontra o primeiro da fila para este setor
            const clienteParaChamar = filaAtual.find(p => p.setorCodigo === dadosSala.setorCodigo);

            if (clienteParaChamar) {
                // Atualiza no Banco: Define como ATENDIDO e salva a hora
                clienteParaChamar.status = 'atendido';
                clienteParaChamar.dataAtendimento = new Date();
                clienteParaChamar.salaAtendimento = dadosSala.room;
                await clienteParaChamar.save(); // Salva alteração no Mongo

                // Atualiza Variáveis de Chamada
                ultimoChamado = {
                    name: clienteParaChamar.nome,
                    room: dadosSala.room,
                    sector: dadosSala.setorNome,
                    prioridade: clienteParaChamar.prioridade,
                    isRepeat: false
                };

                historicoChamadas.unshift({ ...ultimoChamado });
                if (historicoChamadas.length > 3) historicoChamadas.pop();

                // Emite atualizações
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

// --- 5. ROTA DE ESTATÍSTICAS (NOVO!) ---
app.get('/api/stats', async (req, res) => {
    try {
        const totalAtendidos = await Cliente.countDocuments({ status: 'atendido' });
        const totalFila = await Cliente.countDocuments({ status: 'aguardando' });
        
        // Média de espera (apenas dos atendidos hoje)
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const atendidosHoje = await Cliente.find({ 
            status: 'atendido', 
            dataAtendimento: { $gte: hoje } 
        });

        let tempoTotal = 0;
        atendidosHoje.forEach(c => {
            tempoTotal += (c.dataAtendimento - c.dataChegada); // diferença em milissegundos
        });

        const mediaMinutos = atendidosHoje.length > 0 
            ? Math.floor((tempoTotal / atendidosHoje.length) / 60000) 
            : 0;

        res.json({ totalAtendidos, totalFila, mediaMinutos, atendidosHoje: atendidosHoje.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));