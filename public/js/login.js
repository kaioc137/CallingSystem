        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const tipo = document.getElementById('userType').value;
            const senha = document.getElementById('password').value;
            const errorMsg = document.getElementById('errorMsg');

            try {
                const res = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo, senha })
                });

                const data = await res.json();

                if (data.success) {
                    window.location.href = data.redirect; // Redireciona para a página certa
                } else {
                    errorMsg.style.display = 'block';
                    errorMsg.innerText = "Senha incorreta.";
                }
            } catch (err) {
                console.error(err);
                errorMsg.style.display = 'block';
                errorMsg.innerText = "Erro ao conectar.";
            }
        });