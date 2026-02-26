require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- 1. CONFIGURAÇÕES INICIAIS ---

// Sessão (Login)
app.use(session({
    secret: 'segredo-super-secreto-do-kaio',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Em produção com HTTPS, o ideal é true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 2. SISTEMA DE LOGIN ---

const SENHAS = {
    recepcao: process.env.SENHA_RECEP || "admin123",
    sala: process.env.SENHA_SALA || "sala123",
    admin: process.env.SENHA_ADMIN || "master123"
};

app.post('/login', (req, res) => {
    const { tipo, senha } = req.body;
    if (SENHAS[tipo] && SENHAS[tipo] === senha) {
        req.session.user = tipo;
        req.session.isLogged = true;
        
        let destino = '/recepcao';
        if (tipo === 'sala') destino = '/salas';
        if (tipo === 'admin') destino = '/admin';

        return res.json({ success: true, redirect: destino });
    }
    res.json({ success: false });
});

function verificarAutenticacao(req, res, next) {
    if (req.session.isLogged) return next();
    res.redirect('/');
}

// Rotas Protegidas
app.get('/recepcao', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'recepcao.html'));
});
app.get('/salas', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'salas.html'));
});
app.get('/admin', verificarAutenticacao, (req, res) => {
    res.sendFile(path.join(__dirname, 'private', 'admin.html'));
});

// --- 3. BANCO DE DADOS E MODELOS ---

const mongoURI = process.env.MONGO_URI || "mongodb+srv://SEU_USUARIO:SUA_SENHA@cluster0.mongodb.net/?retryWrites=true&w=majority";

// Modelo Cliente
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

// Modelo Setor (Configuração Dinâmica)
const SetorSchema = new mongoose.Schema({
    codigo: String,
    nome: String,
    sala: String
});
const Setor = mongoose.model('Setor', SetorSchema);

// --- 4. API (ROTAS DE DADOS) ---

// 4.1 Estatísticas
app.get('/api/stats', async (req, res) => {
    try {
        const totalAtendidos = await Cliente.countDocuments({ status: 'atendido' });
        const totalFila = await Cliente.countDocuments({ status: 'aguardando' });
        
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        const atendidosHoje = await Cliente.find({ status: 'atendido', dataAtendimento: { $gte: hoje } });

        let tempoTotalGeral = 0;
        const statsPorSetor = {};

        atendidosHoje.forEach(c => {
            const diff = c.dataAtendimento - c.dataChegada;
            tempoTotalGeral += diff;
            const setor = c.setorNome || "Outros";

            if (!statsPorSetor[setor]) statsPorSetor[setor] = { qtd: 0, tempoTotal: 0 };
            statsPorSetor[setor].qtd++;
            statsPorSetor[setor].tempoTotal += diff;
        });

        const mediaGeral = atendidosHoje.length > 0 ? Math.floor((tempoTotalGeral / atendidosHoje.length) / 60000) : 0;
        const porSetor = Object.keys(statsPorSetor).map(nome => ({
            nome,
            qtd: statsPorSetor[nome].qtd,
            media: Math.floor((statsPorSetor[nome].tempoTotal / statsPorSetor[nome].qtd) / 60000)
        }));

        res.json({ totalAtendidos, totalFila, mediaMinutos: mediaGeral, atendidosHoje: atendidosHoje.length, porSetor });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4.2 Relatório CSV (Excel)
app.get('/api/reports/csv', async (req, res) => {
    try {
        const atendidos = await Cliente.find({ status: 'atendido' }).sort({ dataAtendimento: -1 });
        let csv = 'Nome;Setor;Prioridade;Data Chegada;Data Atendimento;Espera (min);Sala\n';

        atendidos.forEach(c => {
            const chegada = c.dataChegada ? new Date(c.dataChegada).toLocaleString('pt-BR') : '-';
            const atendimento = c.dataAtendimento ? new Date(c.dataAtendimento).toLocaleString('pt-BR') : '-';
            let espera = 0;
            if(c.dataChegada && c.dataAtendimento) {
                espera = Math.floor((new Date(c.dataAtendimento) - new Date(c.dataChegada)) / 60000);
            }
            const nome = (c.nome || '').replace(/;/g, ' ');
            const setor = (c.setorNome || '').replace(/;/g, ' ');
            const sala = (c.salaAtendimento || '').replace(/;/g, ' ');
            const prioridade = c.prioridade ? 'SIM' : 'NÃO';
            csv += `${nome};${setor};${prioridade};${chegada};${atendimento};${espera};${sala}\n`;
        });

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.header('Content-Disposition', 'attachment; filename="relatorio_atendimentos.csv"');
        res.send("\uFEFF" + csv);
    } catch (e) { res.status(500).send('Erro ao gerar relatório'); }
});

// 4.3 Configuração de Setores (O QUE ESTAVA FALTANDO)
app.get('/api/config/setores', async (req, res) => {
    try {
        const setores = await Setor.find();
        res.json(setores);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/setores', async (req, res) => {
    try {
        await Setor.create(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/config/setores/:id', async (req, res) => {
    try {
        await Setor.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// --- 5. SOCKET.IO (TEMPO REAL) ---

let historicoChamadas = [];
let ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };

async function carregarFilaDoBanco() {
    try {
        const filaBanco = await Cliente.find({ status: 'aguardando' }).sort({ dataChegada: 1 });
        // Reordena por prioridade
        const normais = [];
        const prioridades = [];
        filaBanco.forEach(c => c.prioridade ? prioridades.push(c) : normais.push(c));
        return [...prioridades, ...normais];
    } catch (error) { return []; }
}

io.on('connection', async (socket) => {
    const filaAtual = await carregarFilaDoBanco();
    socket.emit('update-call', ultimoChamado);
    socket.emit('update-queue', filaAtual);
    socket.emit('update-history', historicoChamadas);

    socket.on('ping-keep-alive', async () => {
         // Opcional: Reenviar fila para garantir sincronia
         // socket.emit('update-queue', await carregarFilaDoBanco());
    });

    socket.on('add-to-queue', async (dados) => {
        if (!dados || !dados.nome) return;
        try {
            await Cliente.create({
                nome: String(dados.nome).toUpperCase(),
                setorCodigo: dados.setorCodigo,
                setorNome: dados.setorNome,
                prioridade: dados.prioridade
            });
            io.emit('update-queue', await carregarFilaDoBanco());
        } catch (erro) { console.error("Erro add:", erro); }
    });

    socket.on('remove-from-queue', async (idMongo) => {
        try {
            await Cliente.findByIdAndUpdate(idMongo, { status: 'cancelado' });
            io.emit('update-queue', await carregarFilaDoBanco());
        } catch (erro) { console.error("Erro remove:", erro); }
    });

    socket.on('request-next', async (dadosSala) => {
        try {
            const filaAtual = await carregarFilaDoBanco();
            // Filtra alguém que seja DESTE setor
            const clienteParaChamar = filaAtual.find(p => p.setorCodigo === dadosSala.setorCodigo);

            if (clienteParaChamar) {
                clienteParaChamar.status = 'atendido';
                clienteParaChamar.dataAtendimento = new Date();
                clienteParaChamar.salaAtendimento = dadosSala.room;
                await clienteParaChamar.save();

                ultimoChamado = {
                    id: clienteParaChamar._id, // Envia ID para transferência
                    name: clienteParaChamar.nome,
                    room: dadosSala.room,
                    sector: dadosSala.setorNome,
                    prioridade: clienteParaChamar.prioridade,
                    isRepeat: false
                };

                historicoChamadas.unshift({ ...ultimoChamado });
                if (historicoChamadas.length > 3) historicoChamadas.pop();

                io.emit('update-call', ultimoChamado);
                io.emit('update-history', historicoChamadas);
                io.emit('update-queue', await carregarFilaDoBanco());
            } else {
                socket.emit('error-empty', 'Ninguém aguardando para este setor.');
            }
        } catch (erro) { console.error("Erro next:", erro); }
    });

    socket.on('repeat-call', () => {
        if (ultimoChamado.name !== "BEM-VINDO") {
            io.emit('update-call', { ...ultimoChamado, isRepeat: true });
        }
    });

    // Transferência de Cliente
    socket.on('transfer-client', async (dados) => {
        try {
            await Cliente.findByIdAndUpdate(dados.id, {
                status: 'aguardando',
                setorCodigo: dados.novoSetorCodigo,
                setorNome: dados.novoSetorNome,
                salaAtendimento: null,
                dataAtendimento: null
            });
            
            ultimoChamado = { name: "BEM-VINDO", sector: "AGUARDE", room: "" };
            io.emit('update-queue', await carregarFilaDoBanco());
            io.emit('update-call', ultimoChamado);
            
        } catch (erro) { console.error("Erro transfer:", erro); }
    });
});

// --- 6. INICIALIZAÇÃO ---

async function inicializarSetores() {
    try {
        const total = await Setor.countDocuments();
        if (total === 0) {
            console.log("⚙️ Criando setores padrão...");
            await Setor.create([
                { codigo: 'estagio', nome: 'SETOR DE ESTÁGIO', sala: 'RECEPÇÃO' },
                { codigo: 'diretoria', nome: 'DIRETORIA DO DGRH', sala: 'SALA A2' },
                { codigo: 'terceirizados', nome: 'TERCEIRIZADOS', sala: 'SALA A1' },
                { codigo: 'frequencia', nome: 'FREQUÊNCIA', sala: 'SALA A3' },
                { codigo: 'lotacao', nome: 'LOTAÇÃO', sala: 'SALA A4' },
                { codigo: 'ferias', nome: 'FÉRIAS E LICENÇAS', sala: 'SALA A5' }
            ]);
        }
    } catch (e) { console.error("Erro init setores:", e); }
}

const PORT = process.env.PORT || 3000;

console.log("⏳ Tentando conectar ao MongoDB...");
mongoose.connect(mongoURI)
    .then(() => {
        console.log('✅ Conectado ao MongoDB com sucesso!');
        inicializarSetores(); // Garante que existem setores no banco
        server.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ ERRO CRÍTICO AO CONECTAR NO MONGO:', err);
    });