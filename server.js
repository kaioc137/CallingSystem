require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session'); // <--- BIBLIOTECA DE LOGIN

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. CONFIGURAÇÕES INICIAIS ---

// Configuração da Sessão (Login)
app.use(session({
    secret: 'segredo-super-secreto-do-kaio', // Chave de segurança
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Em produção HTTPS, ideal seria true
}));

app.use(express.json());

// Serve arquivos PÚBLICOS (Login, TV Painel, CSS, Imagens)
// Tudo que estiver na pasta 'public' qualquer um pode acessar sem senha
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. SISTEMA DE LOGIN E SEGURANÇA ---

// Senhas (Pega do .env ou usa padrão se não tiver)
const SENHAS = {
    recepcao: process.env.SENHA_RECEP || "admin123",
    sala: process.env.SENHA_SALA || "sala123",
    admin: process.env.SENHA_ADMIN || "master123"
};

// Rota de Login (Recebe usuário e senha do index.html)
app.post('/login', (req, res) => {
    const { tipo, senha } = req.body;

    if (SENHAS[tipo] && SENHAS[tipo] === senha) {
        req.session.user = tipo;     // Salva quem é
        req.session.isLogged = true; // Marca como logado

        // Define para onde mandar o usuário
        let destino = '/recepcao';
        if (tipo === 'sala') destino = '/salas';
        if (tipo === 'admin') destino = '/admin';

        return res.json({ success: true, redirect: destino });
    }

    res.json({ success: false });
});

// Middleware (O Porteiro): Só deixa passar se estiver logado
function verificarAutenticacao(req, res, next) {
    if (req.session.isLogged) {
        return next(); // Pode passar
    }
    res.redirect('/'); // Não tem crachá? Volta pro login
}

// --- 3. ROTAS PROTEGIDAS (Arquivos na pasta 'private') ---

app.get('/recepcao', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'recepcao.html'));
});

app.get('/salas', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'salas.html'));
});

app.get('/admin', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});


// --- 4. CONFIGURAÇÃO DO BANCO DE DADOS (MongoDB) ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://SEU_USUARIO:SUA_SENHA@cluster0.mongodb.net/?retryWrites=true&w=majority";

// Modelo de Dados
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

// --- 5. LÓGICA DO SOCKET.IO (Fila e Chamadas) ---

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

// --- 6. ROTA DE ESTATÍSTICAS (Por Setor) ---
app.get('/api/stats', async (req, res) => {
    try {
        const totalAtendidos = await Cliente.countDocuments({ status: 'atendido' });
        const totalFila = await Cliente.countDocuments({ status: 'aguardando' });
        
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const atendidosHoje = await Cliente.find({ 
            status: 'atendido', 
            dataAtendimento: { $gte: hoje } 
        });

        let tempoTotalGeral = 0;
        const statsPorSetor = {};

        atendidosHoje.forEach(c => {
            const diff = c.dataAtendimento - c.dataChegada;
            tempoTotalGeral += diff;
            const setor = c.setorNome || "Outros";

            if (!statsPorSetor[setor]) {
                statsPorSetor[setor] = { qtd: 0, tempoTotal: 0 };
            }
            statsPorSetor[setor].qtd++;
            statsPorSetor[setor].tempoTotal += diff;
        });

        const mediaGeral = atendidosHoje.length > 0 
            ? Math.floor((tempoTotalGeral / atendidosHoje.length) / 60000) 
            : 0;

        const porSetor = Object.keys(statsPorSetor).map(nomeSetor => {
            const dados = statsPorSetor[nomeSetor];
            return {
                nome: nomeSetor,
                qtd: dados.qtd,
                media: Math.floor((dados.tempoTotal / dados.qtd) / 60000)
            };
        });

        res.json({ totalAtendidos, totalFila, mediaMinutos: mediaGeral, atendidosHoje: atendidosHoje.length, porSetor });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;

// --- 7. INICIALIZAÇÃO (Conecta Banco -> Inicia Servidor) ---
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