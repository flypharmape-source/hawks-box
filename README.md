# Hawks Box — Placar de Campeonato (multi-box)

Sistema de campeonatos (estilo CrossFit) com login, dois sistemas de pontuação
(pontos por colocação / invertido), separação por empresa (box) e um admin global.

## Como funciona o acesso
- Cada empresa/box se **cadastra** (Cadastre-se) informando os dados da empresa.
  Quem se cadastra vira o dono ("owner") daquela box.
- Cada usuário enxerga **apenas os campeonatos da sua própria box**.
- O **admin global** enxerga os campeonatos de **todas as boxes**. O admin não é criado
  pela tela de cadastro: ele vem das variáveis de ambiente (abaixo).

## Arquitetura
Navegador → API Node/Express (`server.js`) → Postgres (tabelas: boxes, users, championships).

## Variáveis de ambiente no Railway (serviço do site)
- `DATABASE_URL`  → referência ao Postgres: `${{Postgres.DATABASE_URL}}`
- `JWT_SECRET`    → um texto secreto longo e aleatório (assina os logins)
- `ADMIN_EMAIL`   → e-mail do admin global (ex.: voce@hawks.com)
- `ADMIN_PASSWORD`→ senha do admin global (troque depois; muda por aqui a qualquer momento)
- `ADMIN_NAME`    → (opcional) nome do admin
- `PORT`          → injetado pelo Railway automaticamente

O admin é criado/atualizado toda vez que o app sobe, a partir de ADMIN_EMAIL/ADMIN_PASSWORD.
Para trocar a senha do admin, mude ADMIN_PASSWORD e redeploy.

## Passos
1. Suba os arquivos no GitHub mantendo `public/index.html` dentro da pasta `public`.
2. Railway: Deploy from GitHub repo + Add PostgreSQL.
3. Variables do site: DATABASE_URL (referência), JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD.
4. Redeploy → Settings → Networking → Generate Domain.
5. Boxes se cadastram pela tela "Cadastre-se"; você entra como admin com ADMIN_EMAIL/senha.

## Rodar localmente
```
npm install
DATABASE_URL="..." JWT_SECRET="..." ADMIN_EMAIL="a@a.com" ADMIN_PASSWORD="admin123" npm start
```

## Próximos passos possíveis
- Vários usuários por box (hoje o cadastro cria 1 dono por box).
- Papéis dentro da box (juiz que só lança resultado).
- Placar ao vivo por WebSocket (sem apertar Sincronizar).
