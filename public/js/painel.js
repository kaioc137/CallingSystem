   const socket = io();
        const elName = document.getElementById('name');
        const elSector = document.getElementById('sector');
        const elRoom = document.getElementById('room');
        const elCard = document.getElementById('card');
        const elBadge = document.getElementById('priorityBadge');
        const historyList = document.getElementById('historyList');
        const statusDot = document.getElementById('statusDot');
        const linkMobile = window.location.origin + "/mobile.html";

        socket.on('connect', () => statusDot.classList.add('connected'));
        socket.on('disconnect', () => statusDot.classList.remove('connected'));
        setInterval(() => { socket.emit('ping-keep-alive'); }, 1000 * 60 * 5);

        function speak(text) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'pt-BR'; u.rate = 1.1;
            window.speechSynthesis.speak(u);
        }

        socket.on('update-call', (data) => {
            const currentText = elName.innerText;
            elName.innerText = data.name;
            elSector.innerText = data.sector;
            elRoom.innerText = data.room;

            // Mostra/Esconde selo de prioridade
            elBadge.style.display = data.prioridade ? 'block' : 'none';

            if(data.name !== "BEM-VINDO" && (data.name !== currentText || data.isRepeat)) {
                elCard.classList.remove('blink');
                void elCard.offsetWidth; 
                elCard.classList.add('blink');
                setTimeout(() => elCard.classList.remove('blink'), 4000);

                let text = `${data.name}, compareça ao ${data.sector}, na ${data.room}`;
                if (data.prioridade) text = `Atendimento prioritário. ${text}`;
                if (data.isRepeat) text = `Atenção. ${text}`;
                speak(text.toLowerCase()); 
            }
        });

        // Recebe o Histórico e desenha no rodapé
        socket.on('update-history', (lista) => {
            historyList.innerHTML = '';
            lista.forEach(item => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <span class="hist-name">${item.name}</span>
                    <span class="hist-loc">${item.room} - ${item.sector}</span>
                `;
                historyList.appendChild(div);
            });
        });
        new QRCode(document.getElementById("qrcode"), {
        text: linkMobile,
        width: 100,
        height: 100,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });