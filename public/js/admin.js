// --- 1. DADOS DOS CARDS GERAIS ---
async function carregarDados() {
    try {
        const res = await fetch('/api/stats');
        const dados = await res.json();

        // Atualiza Geral
        document.getElementById('fila').innerText = dados.totalFila;
        document.getElementById('atendidosHoje').innerText = dados.atendidosHoje;
        document.getElementById('media').innerText = dados.mediaMinutos;
        document.getElementById('total').innerText = dados.totalAtendidos;

        // Atualiza Por Setor
        const container = document.getElementById('sectorContainer');
        container.innerHTML = ""; 

        if (dados.porSetor && dados.porSetor.length > 0) {
            dados.porSetor.forEach(setor => {
                const div = document.createElement('div');
                div.className = 'sector-card';
                div.innerHTML = `
                    <span class="sector-name">${setor.nome}</span>
                    <div class="sector-stats">
                        <span>👥 ${setor.qtd} atendidos</span>
                        <span>⏱️ ${setor.media} min espera</span>
                    </div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p style="color:#999; grid-column: 1/-1;">Nenhum atendimento realizado hoje ainda.</p>';
        }

    } catch (err) {
        console.error("Erro ao buscar dados", err);
    }
}

// --- 2. BAIXAR RELATÓRIO EXCEL ---
function baixarRelatorio() {
    window.location.href = '/api/reports/csv';
} // <-- A CHAVE QUE ESTAVA FALTANDO!

// --- 3. FUNÇÃO PARA GERAR OS GRÁFICOS ---
async function carregarGraficos() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (!data.porSetor || data.porSetor.length === 0) {
            console.log("Nenhum atendimento finalizado hoje para gerar gráficos.");
            return;
        }

        const nomesSetores = data.porSetor.map(s => s.nome);
        const qtdAtendimentos = data.porSetor.map(s => s.qtd);
        const mediaEspera = data.porSetor.map(s => s.media);

        const paletaCores = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e'];

        new Chart(document.getElementById('chartAtendimentos'), {
            type: 'doughnut',
            data: {
                labels: nomesSetores,
                datasets: [{
                    data: qtdAtendimentos,
                    backgroundColor: paletaCores,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });

        new Chart(document.getElementById('chartTempo'), {
            type: 'bar',
            data: {
                labels: nomesSetores,
                datasets: [{
                    label: 'Espera Média (Minutos)',
                    data: mediaEspera,
                    backgroundColor: '#e67e22',
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { 
                        beginAtZero: true,
                        title: { display: true, text: 'Minutos' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });

    } catch (e) {
        console.error("Erro ao desenhar gráficos:", e);
    }
}

// Inicializa tudo quando a página abre
carregarDados();
carregarGraficos(); 
setInterval(carregarDados, 15000); // Atualiza os números (mas não recarrega o gráfico para não piscar a tela)