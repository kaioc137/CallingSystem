  async function carregarDados() {
            try {
                const res = await fetch('/api/stats');
                const dados = await res.json();

                // 1. Atualiza Geral
                document.getElementById('fila').innerText = dados.totalFila;
                document.getElementById('atendidosHoje').innerText = dados.atendidosHoje;
                document.getElementById('media').innerText = dados.mediaMinutos;
                document.getElementById('total').innerText = dados.totalAtendidos;

                // 2. Atualiza Por Setor
                const container = document.getElementById('sectorContainer');
                container.innerHTML = ""; // Limpa anterior

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

        function baixarRelatorio() {
        // Simplesmente redireciona o navegador para a rota que criamos
        // Isso força o download automático
        window.location.href = '/api/reports/csv';
}

        carregarDados(); 
        setInterval(carregarDados, 15000); // Atualiza a cada 15s