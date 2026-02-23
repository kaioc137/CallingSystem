 const socket = io();
        const configSelect = document.getElementById('configSelect');
        const myQueueCount = document.getElementById('myQueueCount');
        const mySectorList = document.getElementById('mySectorList');
        let myCurrentSectorCode = "";

        // Ping para manter servidor acordado (Plano A)
        setInterval(() => {
            socket.emit('ping-keep-alive');
        }, 1000 * 60 * 5);

        const savedConfig = localStorage.getItem('salaConfig');
        if (savedConfig) configSelect.value = savedConfig;

        updateMyCountLogic(configSelect.value);

        configSelect.addEventListener('change', () => {
            localStorage.setItem('salaConfig', configSelect.value);
            updateMyCountLogic(configSelect.value);
            // Ao mudar o select, pedimos a atualização visual imediata se já tivermos dados
            // Mas o socket vai atualizar na próxima batida de qualquer forma.
        });

        function updateMyCountLogic(value) {
            const [codigo] = value.split('|');
            myCurrentSectorCode = codigo;
        }

        function callNext() {
            const [setorCodigo, room, setorNome] = configSelect.value.split('|');
            socket.emit('request-next', { setorCodigo, room, setorNome });
        }

        function repeatCall() {
            socket.emit('repeat-call');
        }

        socket.on('update-queue', (listaTotal) => {
            if(!myCurrentSectorCode) {
                 const [codigo] = configSelect.value.split('|');
                 myCurrentSectorCode = codigo;
            }

            const pessoasDoMeuSetor = listaTotal.filter(p => p.setorCodigo === myCurrentSectorCode);
            myQueueCount.innerText = pessoasDoMeuSetor.length;
            mySectorList.innerHTML = "";
            
            if (pessoasDoMeuSetor.length === 0) {
                const li = document.createElement('li');
                li.style.justifyContent = "center";
                li.innerText = "(Fila vazia)";
                mySectorList.appendChild(li);
            } else {
                pessoasDoMeuSetor.forEach((pessoa, index) => {
                    const li = document.createElement('li');
                    
                    // AQUI A MUDANÇA: Verifica se tem prioridade
                    const badge = pessoa.prioridade ? '⭐' : '';
                    
                    li.innerHTML = `<span>${index + 1}. ${pessoa.nome} ${badge}</span>`;
                    
                    // Se for prioridade, deixa o texto negrito ou vermelho (opcional)
                    if(pessoa.prioridade) li.style.color = "#d35400";

                    mySectorList.appendChild(li);
                });
            }
        });

        socket.on('error-empty', (msg) => alert(msg));