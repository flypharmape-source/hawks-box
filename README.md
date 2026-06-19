# Hawks Box — Placar de Campeonato

Sistema de gestão de campeonatos (estilo CrossFit) com dois sistemas de pontuação
(pontos por colocação · mais vence / invertido · menos vence), salvando os dados
num banco Postgres na nuvem. Site, API e banco rodam no Railway.

## Arquitetura
Navegador (site em `public/index.html`) → API Node/Express (`server.js`) → Postgres.

## Subir no Railway

### 1. Mandar o código pro GitHub
Crie um repositório e suba estes arquivos (sem a pasta `node_modules`):
```
server.js
package.json
package-lock.json
.gitignore
public/index.html
```

### 2. Criar o serviço no Railway
- No Railway: **New Project → Deploy from GitHub repo** e escolha o repositório.
- O Railway detecta Node automaticamente e roda `npm install` + `npm start`.

### 3. Adicionar o banco
- Dentro do mesmo projeto: **New → Database → Add PostgreSQL**.

### 4. Conectar o site ao banco (passo que mais gera dúvida)
- Abra o serviço do **site** → aba **Variables** → **New Variable**.
- Crie a variável `DATABASE_URL` e, no valor, use a referência do Postgres:
  `${{Postgres.DATABASE_URL}}`
  (o Railway oferece "Add Reference" / "Variable Reference" — selecione o serviço Postgres e a variável `DATABASE_URL`).
- O `PORT` o Railway injeta sozinho; não precisa configurar.

### 5. Gerar o link público
- No serviço do site: **Settings → Networking → Generate Domain**.
- Abra o domínio gerado. Na primeira vez, o servidor cria a tabela sozinho.

Pronto: você e seu sócio acessam o mesmo placar pelo link, de qualquer aparelho.

## Rodar no seu computador (opcional)
```
npm install
DATABASE_URL="sua_string_do_postgres" npm start
# abra http://localhost:3000
```

## Observações
- **Dados compartilhados:** ficam no Postgres, então todos veem o mesmo placar.
  O botão **Sincronizar** (no placar) puxa a versão mais recente do servidor.
- **Edição simultânea:** cada campeonato é salvo por inteiro; se duas pessoas
  editarem o MESMO campeonato ao mesmo tempo, a última gravação prevalece.
  Para um placar 100% ao vivo (sem precisar sincronizar na mão), o próximo passo
  seria atualização em tempo real (WebSocket) — dá pra adicionar depois.
