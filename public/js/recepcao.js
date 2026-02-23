 const socket = io();
        const nameInput = document.getElementById('nameInput');
        const sectorInput = document.getElementById('sectorInput');
        const priorityInput = document.getElementById('priorityInput'); // Checkbox
        const queueList = document.getElementById('queueList');
        const restoreArea = document.getElementById('restoreArea');

        setInterval(() => { socket.emit('ping-keep-alive'); }, 1000 * 60 * 5);

        function addPerson() {
            const nome = nameInput.value.trim().toUpperCase();
            const index = sectorInput.selectedIndex;
            const setorCodigo = sectorInput.value;
            const setorNome = sectorInput.options[index].text; 
            const prioridade = priorityInput.checked; // Pega valor true/false

            if (nome) {
                // Envia dados completos
                socket.emit('add-to-queue', { nome, setorCodigo, setorNome, prioridade });
                
                nameInput.value = '';
                priorityInput.checked = false; // Reseta checkbox
                nameInput.focus();
            }
        }

        function removePerson(idMongo) {
            if(confirm('Remover esta pessoa?')) {
                socket.emit('remove-from-queue', idMongo);
            }
        }

        nameInput.addEventListener("keypress", (e) => { if (e.key === "Enter") addPerson(); });

        socket.on('update-queue', (lista) => {
            document.getElementById('count').innerText = lista.length;
            queueList.innerHTML = "";
            
            lista.forEach((pessoa, i) => {
                const li = document.createElement('li');
                // Se for prioridade, adiciona estrela ⭐
                const iconPrioridade = pessoa.prioridade ? '<span class="badge-priority">⭐ PRIORIDADE</span>' : '';
                
                li.innerHTML = `
                    <div class="info-container">
                        <strong>${i + 1}.</strong> ${pessoa.nome} ${iconPrioridade}
                        <span class="tag ${pessoa.setorCodigo}">${pessoa.setorNome}</span>
                    </div>
                    <button class="btn-trash" onclick="removePerson('${pessoa._id}')">🗑️</button>
                `;
                queueList.appendChild(li);
            });

            // Backup Automático
            if (lista.length > 0) {
                localStorage.setItem('backupFila', JSON.stringify(lista));
                restoreArea.style.display = 'none';
            } else {
                const backup = localStorage.getItem('backupFila');
                if (backup && JSON.parse(backup).length > 0) restoreArea.style.display = 'block';
            }
        });

        function restoreQueue() {
            const backup = localStorage.getItem('backupFila');
            if (backup) {
                socket.emit('restore-queue', JSON.parse(backup));
                restoreArea.style.display = 'none';
            }
        }
        function ignoreBackup() {
            localStorage.removeItem('backupFila');
            restoreArea.style.display = 'none';
        }