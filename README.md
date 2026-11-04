# MMORTEKX CINE TV

Aplicativo para TVs LG com webOS, adaptado exclusivamente do aplicativo mobile **[MMORTEKX-CINE_APP](https://github.com/mauriciorebum/MMORTEKX-CINE_APP)**. O repositório `app-tv` não faz parte deste projeto e não é usado como base.

## Objetivo

Manter a mesma experiência e as funções existentes no aplicativo mobile, reorganizadas para tela grande e navegação com controle LG Magic Remote. O app é um pacote webOS local (`.ipk`), não um APK Android e não depende de abrir o navegador da TV.

## Funcionalidades portadas

- Conexão e autenticação no Jellyfin.
- Restauração do endereço e usuário do servidor; a senha não é salva na TV.
- Consulta das bibliotecas e carregamento de filmes, séries, animes e desenhos.
- Filtros por Todos, Animes, Filmes, Séries e Desenhos.
- Busca por termos no título e na sinopse.
- Destaque principal, recém-adicionados e seção Continue assistindo.
- Seleção de até cinco perfis, criação e PIN opcional de quatro dígitos.
- Edição de perfil, alteração/remoção de PIN e foto de perfil.
- Favoritos, histórico e progresso separados por perfil, usando o serviço de perfis na porta TCP 8788.
- Detalhes do título, sinopse, gêneros, temporadas e episódios.
- Reprodução HLS do Jellyfin, retomada de posição, pausa, avanço/retrocesso de 10 segundos e velocidade de 0,5x a 2x.
- Navegação por setas, OK/Enter e Voltar; foco visível para o controle remoto e suporte ao ponteiro do Magic Remote.
- Aba Mangá mantida como placeholder, igual ao estado do app mobile de referência.

## Arquitetura

O aplicativo é uma aplicação web estática em JavaScript/CSS, empacotada com o CLI oficial do webOS:

- `webos/appinfo.json`: metadados e identificação do app.
- `webos/index.html`: entrada do aplicativo.
- `webos/app.js`: telas, estado, API Jellyfin, perfis, detalhes, player e navegação do controle.
- `webos/core.js`: utilitários testáveis de dados Jellyfin, categorias, URLs e formatação.
- `webos/styles.css`: interface TV em 16:9, foco e estados do Magic Remote.
- `.github/workflows/build-webos.yml`: testes e empacotamento do IPK.
- `scripts/create_icon.py`: cria o ícone PNG de 80×80 a partir do GIF oficial da marca.

O app usa o Jellyfin em `http://192.168.0.100:8096` por padrão e procura o serviço de perfis no mesmo host, porta `8788`, conforme o contrato do aplicativo mobile.

## Compilação e testes

Cada push relevante para a branch `main` executa o workflow **Build LG webOS IPK**:

1. Instala Node.js 24 e o pacote oficial `@webos-tools/cli`.
2. Seleciona o perfil `tv` do CLI.
3. Gera o ícone do aplicativo.
4. Executa os testes Node e valida os arquivos/metadados.
5. Empacota `webos/` em um arquivo `.ipk`.
6. Publica o IPK como artefato do workflow por 30 dias.

Para compilar localmente, com Node.js 20+ e o CLI webOS instalado:

```bash
npm test
npm run check
npm run icon
npm run package
```

O pacote sai em `build/`.

## Integração de rede: CORS obrigatório

O app webOS roda em um contexto de navegador. Diferentemente do app Flutter nativo, as chamadas HTTP para Jellyfin e para o serviço Node de perfis estão sujeitas à política CORS do navegador. Antes do teste de ponta a ponta, é necessário permitir a origem da aplicação TV nos dois serviços.

### Jellyfin

No Dashboard do Jellyfin, em **Networking → CORS Allowed Origins**, permita a origem que o Web Inspector da TV mostrar para o app. O navegador pode reportar uma origem opaca (`null`) para apps locais; confirme a origem real antes de configurar. Não exponha o Jellyfin à internet apenas para contornar CORS.

### Serviço de perfis (porta 8788)

O `profile-service/server.js` da aplicação mobile responde a OPTIONS, mas atualmente não envia `Access-Control-Allow-Origin`. Sem esse cabeçalho, o navegador da TV bloqueia chamadas de perfis, PIN, favoritos, histórico e progresso.

No servidor, ajuste o bloco que cria o HTTP server no final de `profile-service/server.js` para adicionar CORS à origem autorizada. Exemplo restrito à origem opaca `null` (confirme no Web Inspector antes de aplicar):

```js
const allowedOrigins = new Set(
  (process.env.PROFILE_CORS_ORIGINS || "null")
    .split(",").map(value => value.trim()).filter(Boolean)
);

http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "600"
    });
    return res.end();
  }
  route(req, res);
}).listen(PORT, HOST, () => {
  console.log("MMORTEKX profile service listening on " + HOST + ":" + PORT);
  console.log("Profiles data directory: " + DATA_DIR);
});
```

Se a origem do Web Inspector for diferente de `null`, configure `PROFILE_CORS_ORIGINS` com a origem exata. Não use `*` em uma rede não confiável. Reinicie o serviço depois da alteração.

## Instalação na LG

1. Baixe o artefato `MMORTEKX-CINE-TV-IPK` na execução bem-sucedida do workflow.
2. Ative o Developer Mode na TV com o aplicativo oficial Developer Mode.
3. Use webOS Dev Manager ou o CLI para instalar o IPK na TV.
4. Abra o MMORTEKX CINE no launcher e informe o endereço/usuário/senha do Jellyfin.

A instalação e o lançamento no aparelho físico ainda precisam ser validados no modelo específico da TV.

## Limites conhecidos da primeira compilação

- O CI valida sintaxe, utilitários, metadados e empacotamento; ele não substitui o teste em uma TV LG real.
- O suporte efetivo a HLS, codecs, transcodificação e reprodução contínua depende do webOS e do modelo da TV. A reprodução deverá ser testada no aparelho.
- A interface do player oferece as mesmas funções implementadas no player mobile de referência; seleção de faixas de áudio/legendas não existia nesse player mobile e não foi inventada nesta adaptação.
- A aba Mangá continua sendo um placeholder porque também está assim no aplicativo mobile de referência.
- A versão de software informada para a TV foi 03.53.45. A associação desse firmware ao webOS 6.5.3 é apenas indicativa; o modelo e a versão exata precisam ser confirmados na TV.

## Segurança

- A senha do Jellyfin não é persistida em `localStorage`; será solicitada ao abrir uma nova sessão.
- O token Jellyfin e o token temporário do perfil ficam somente na memória da sessão do app.
- O serviço de perfis deve permanecer restrito à rede doméstica confiável. O PIN protege perfis, mas não substitui autenticação administrativa nem HTTPS para acesso remoto.
