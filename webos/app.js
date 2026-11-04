import {
  normalizeSearch, mapJellyfinItem, categoryFor, profileServerFrom,
  buildPlaybackUrl, posterUrl, formatTicks, formatTime
} from "./core.js";

const root = document.getElementById("app");
const DEFAULT_SERVER = "http://192.168.0.100:8096";
const APP_VERSION = "0.1.0";
const state = {
  page: "connect",
  server: localStorage.getItem("mmortekx.server") || DEFAULT_SERVER,
  username: localStorage.getItem("mmortekx.username") || "mortekx",
  password: "",
  token: null,
  userId: null,
  busy: false,
  error: "",
  libraries: [],
  items: [],
  itemCategories: {},
  selectedLibrary: null,
  selectedFilter: "Todos",
  profiles: [],
  profilesLoading: false,
  profilesError: "",
  activeProfile: null,
  profileSessionToken: null,
  favorites: [],
  history: [],
  progress: {},
  searchOpen: false,
  searchQuery: "",
  showSettings: false,
  modal: null,
  currentItem: null,
  detailData: null,
  seasons: [],
  episodes: [],
  seasonId: null,
  detailError: "",
  episodesLoading: false,
  player: null,
  playbackSpeed: 1,
  toastTimer: null,
  saveTimer: null,
  controlsTimer: null
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const serverBase = () => state.server.replace(/\/+$/, "");
const profileBase = () => profileServerFrom(serverBase());
const embyHeaderValue = () => 'MediaBrowser Client="MMORTEKX CINE", Device="LG webOS TV", DeviceId="mmortekx-cine-webos", Version="' + APP_VERSION + '"' + (state.token ? ', Token="' + state.token + '"' : "");
const jellyfinHeaders = () => ({
  "Accept": "application/json",
  "Content-Type": "application/json",
  "X-Emby-Authorization": embyHeaderValue(),
  "Authorization": embyHeaderValue(),
  ...(state.token ? { "X-Emby-Token": state.token } : {})
});
const profileHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": "Bearer " + (state.profileSessionToken || "")
});

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}
function avatarHtml(profile, sizeClass) {
  const data = profile && profile.avatarData;
  const content = data && String(data).startsWith("data:image/")
    ? '<img src="' + esc(data) + '" alt="">'
    : "🐹";
  return '<div class="avatar ' + (sizeClass || "") + '">' + content + '</div>';
}
function footerHtml() {
  return '<div class="footer-brand"><strong>MMORTEKX <em>CINE</em></strong><span>Onde a capivara reina, conteúdo rola solto</span></div>';
}
function btn(action, label, className, extra) {
  return '<button type="button" class="' + esc(className || "secondary-btn") + '" data-action="' + esc(action) + '"' + (extra || "") + '>' + label + '</button>';
}
function posterImage(item) {
  const url = posterUrl(serverBase(), item, state.token || "");
  return url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '<div class="poster-placeholder">🎬</div>';
}
function posterCard(item) {
  const fav = isFavorite(item);
  const percent = progressPercent(item.id);
  return '<article class="poster-card">' +
    '<button type="button" class="poster-open" data-action="details" data-id="' + esc(item.id) + '" aria-label="Abrir ' + esc(item.name) + '">' + posterImage(item) + '</button>' +
    '<div class="poster-meta"><div class="poster-name">' + esc(item.name) + '</div>' +
    '<button type="button" class="fav-btn ' + (fav ? "is-favorite" : "") + '" data-action="favorite" data-id="' + esc(item.id) + '" aria-label="Favorito">' + (fav ? "♥" : "♡") + '</button></div>' +
    (percent > 0 ? '<div class="progress-track"><div class="progress-fill" style="width:' + percent + '%"></div></div>' : "") +
    '</article>';
}
function posterSection(title, rows) {
  if (!rows || !rows.length) return "";
  return '<section><h2 class="section-title">' + esc(title) + ' <small>' + rows.length + ' títulos</small></h2><div class="poster-row">' + rows.slice(0, 30).map(posterCard).join("") + '</div></section>';
}
function listCard(item, trailingAction) {
  const url = posterUrl(serverBase(), item, state.token || "");
  return '<article class="list-card">' +
    (url ? '<img class="list-poster" src="' + esc(url) + '" alt="" onerror="this.style.opacity=.15">' : '<div class="list-poster poster-placeholder">🎬</div>') +
    '<div style="flex:1;min-width:0"><div class="episode-title">' + esc(item.name) + '</div><div class="muted">' + esc([item.year, item.type].filter(Boolean).join(" • ")) + '</div>' +
    (item.overview ? '<div class="episode-overview">' + esc(item.overview) + '</div>' : "") +
    btn("details", "Ver detalhes", "secondary-btn", ' data-id="' + esc(item.id) + '"') +
    '</div>' + (trailingAction || "") + '</article>';
}
function isFavorite(item) {
  return state.favorites.some(function (row) { return row.id === item.id; });
}
function progressPercent(id) {
  const p = state.progress[id];
  if (!p || !p.durationMs) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(p.positionMs || 0) / Number(p.durationMs) * 100)));
}
function continueWatching() {
  return Object.keys(state.progress).map(function (id) {
    const p = state.progress[id];
    return { id: p.id || id, name: p.name || "Sem título", overview: p.overview || "", year: p.year || null, imageTag: p.imageTag || null, type: p.type || "" };
  }).filter(function (item) { return item.id; });
}
function visibleItems() {
  const catalog = state.items.filter(function (item) { return item.type !== "Episode"; });
  if (state.selectedFilter === "Todos") return catalog;
  return catalog.filter(function (item) { return categoryFor(item, state.itemCategories) === state.selectedFilter; });
}
function filteredSearch() {
  const terms = normalizeSearch(state.searchQuery).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return state.items.filter(function (item) {
    const haystack = normalizeSearch(item.name + " " + item.overview);
    return terms.every(function (term) { return haystack.includes(term); });
  });
}
function errorMessage(error) {
  return error && error.message ? error.message : String(error || "Erro inesperado.");
}
async function requestJson(url, options) {
  const response = await fetch(url, options || {});
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = { message: text.slice(0, 500) }; }
  }
  if (!response.ok) {
    throw new Error(data.error || data.message || ("Falha HTTP " + response.status + " em " + url));
  }
  return data;
}
function toast(message) {
  let node = $(".toast");
  if (!node) {
    node = document.createElement("div");
    node.className = "toast";
    root.appendChild(node);
  }
  node.textContent = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3500);
}
function setBusy(value, message) {
  state.busy = value;
  if (message !== undefined) state.error = message;
  render();
}
function render() {
  if (state.page === "player") {
    renderPlayer();
    return;
  }
  const activeId = document.activeElement && document.activeElement.id;
  const selection = document.activeElement && typeof document.activeElement.selectionStart === "number"
    ? document.activeElement.selectionStart : null;
  const connected = Boolean(state.token && state.activeProfile);
  const header = '<header class="topbar">' +
    '<div class="brand"><div class="brand-symbol"><img src="logo-transparent-fixed.gif" alt=""></div><div>MMORTEKX <span>CINE</span></div></div>' +
    '<div class="topbar-spacer"></div>' +
    (connected && state.searchOpen
      ? '<input id="search-input" class="search-input" type="text" placeholder="Buscar filmes, séries e animes..." value="' + esc(state.searchQuery) + '" autocomplete="off">'
      : "") +
    (connected ? '<div class="top-actions">' +
      btn(state.searchOpen ? "close-search" : "open-search", state.searchOpen ? "✕" : "⌕", "icon-btn") +
      btn("toggle-settings", "⚙", "icon-btn") +
      '</div>' : "") +
    '</header>';
  let content = "";
  if (state.page === "connect") content = renderConnectPage();
  else if (state.page === "profiles") content = renderProfilesPage();
  else if (state.page === "home") content = renderHomePage();
  else if (state.page === "favorites") content = renderFavoritesPage();
  else if (state.page === "manga") content = renderMangaPage();
  else if (state.page === "profile") content = renderProfilePage();
  else if (state.page === "history") content = renderHistoryPage();
  else if (state.page === "details") content = renderDetailsPage();
  else content = renderConnectPage();
  const nav = connected && ["home", "manga", "favorites", "profile"].includes(state.page)
    ? '<nav class="bottom-nav">' +
      navButton("home", "⌂", "Início") +
      navButton("manga", "▤", "Mangá") +
      navButton("favorites", "♥", "Favoritos") +
      navButton("profile", "●", "Perfil") +
      '</nav>' : "";
  root.innerHTML = '<div class="app-shell">' + header +
    '<main class="app-main" id="app-main">' + content + '</main>' + nav +
    renderModal() + '</div>';
  if (activeId) {
    const field = document.getElementById(activeId);
    if (field) {
      field.focus();
      if (selection !== null && typeof field.setSelectionRange === "function") {
        try { field.setSelectionRange(selection, selection); } catch (_) {}
      }
    }
  } else {
    focusFirst();
  }
}
function navButton(page, icon, label) {
  const active = state.page === page || (page === "home" && state.page === "details");
  return '<button type="button" class="nav-btn ' + (active ? "active" : "") + '" data-action="nav" data-page="' + page + '"><span class="nav-icon">' + icon + '</span>' + label + '</button>';
}
function renderConnectPage() {
  return '<section class="connect-layout">' +
    '<div class="connect-brand"><div class="connect-kicker">SEU UNIVERSO DE ENTRETENIMENTO</div>' +
    '<h1 class="connect-title">Onde a capivara manda, o conteúdo rola solto.</h1>' +
    '<p class="connect-copy">Conecte sua TV ao servidor MMORTEKX para acessar seus filmes, séries, animes, favoritos e continuar de onde parou.</p>' +
    '<div class="connect-mark"><img src="logo-transparent-fixed.gif" alt=""></div></div>' +
    '<form id="connect-form" class="panel">' +
    '<h2 class="panel-title">Conectar ao servidor Jellyfin</h2><div class="form-grid">' +
    '<label><span class="field-label">Endereço do servidor</span><input class="text-field" id="server-url" name="server" type="url" value="' + esc(state.server) + '" placeholder="http://192.168.0.100:8096" required></label>' +
    '<label><span class="field-label">Usuário</span><input class="text-field" id="username" name="username" type="text" value="' + esc(state.username) + '" autocomplete="username" required></label>' +
    '<label><span class="field-label">Senha</span><input class="text-field" id="password" name="password" type="password" value="" autocomplete="current-password" required></label>' +
    '</div>' + (state.error ? '<div class="error-box">' + esc(state.error) + '</div>' : "") +
    '<div class="modal-actions"><button class="primary-btn" type="submit" ' + (state.busy ? "disabled" : "") + '>' + (state.busy ? "Conectando..." : "CONECTAR") + '</button></div>' +
    '<p class="form-help">Use o mesmo Wi-Fi/rede do servidor. O endereço pode ser alterado. Por segurança, a senha não fica salva na TV.</p>' +
    '</form></section>' + footerHtml();
}
function renderProfilesPage() {
  const cards = state.profiles.map(function (profile) {
    return '<button type="button" class="profile-card" data-action="choose-profile" data-id="' + esc(profile.id) + '">' +
      avatarHtml(profile) + '<span class="profile-name">' + esc(profile.name) + '</span>' +
      (profile.hasPin ? '<span class="profile-lock">🔒 PIN protegido</span>' : '<span class="profile-lock">Entrar</span>') +
      '</button>';
  }).join("");
  const status = state.profilesLoading
    ? '<div class="empty-state"><div class="empty-icon">◌</div><strong>Carregando perfis...</strong></div>'
    : state.profilesError
      ? '<div class="error-box">' + esc(state.profilesError) + '</div>' + btn("refresh-profiles", "Tentar novamente", "primary-btn")
      : state.profiles.length ? cards : '<div class="empty-state"><div class="empty-icon">🐹</div><strong>Ainda não há perfis</strong><span>Crie o primeiro perfil para começar.</span></div>';
  return '<section class="page" style="text-align:center;padding-top:5vh">' +
    '<div class="connect-kicker">MMORTEKX CINE</div><h1 class="page-heading" style="font-size:42px;margin-top:12px">Quem está assistindo?</h1>' +
    '<p class="page-subtitle">Escolha seu perfil para continuar</p><div class="profile-grid">' + status +
    (state.profiles.length < 5 && !state.profilesLoading
      ? '<button type="button" class="profile-card add-profile" data-action="new-profile"><div class="avatar">＋</div><span class="profile-name">Adicionar perfil</span></button>' : "") +
    '</div>' + footerHtml() + '</section>';
}
function renderSettingsPanel() {
  return '<section class="panel" style="margin:20px 0">' +
    '<h2 class="panel-title">Conectar ao servidor Jellyfin</h2><form id="settings-form" class="form-grid">' +
    '<label><span class="field-label">Endereço do servidor</span><input class="text-field" id="settings-server" name="server" type="url" value="' + esc(state.server) + '" required></label>' +
    '<label><span class="field-label">Usuário</span><input class="text-field" id="settings-user" name="username" type="text" value="' + esc(state.username) + '" required></label>' +
    '<label><span class="field-label">Senha</span><input class="text-field" id="settings-password" name="password" type="password" autocomplete="current-password" required></label>' +
    (state.error ? '<div class="error-box">' + esc(state.error) + '</div>' : "") +
    '<div class="modal-actions"><button class="primary-btn" type="submit" ' + (state.busy ? "disabled" : "") + '>Salvar e conectar</button></div>' +
    '<p class="form-help">A senha será usada somente durante a conexão atual e não será gravada no armazenamento da TV.</p></form></section>';
}
function renderHomePage() {
  let inner = "";
  if (state.searchOpen) {
    const found = filteredSearch();
    inner = '<h1 class="page-heading">Busca na biblioteca</h1>' +
      (state.searchQuery.trim() ? '<p class="page-subtitle">' + found.length + ' resultado(s) para "' + esc(state.searchQuery) + '"</p>' : '<p class="page-subtitle">Digite parte do nome para pesquisar na sua biblioteca.</p>') +
      (found.length ? '<div class="poster-row">' + found.map(posterCard).join("") + '</div>' :
        (state.searchQuery.trim() ? '<div class="empty-state"><div class="empty-icon">⌕</div><strong>Nenhum resultado encontrado</strong><span>Tente outro trecho do nome.</span></div>' : ""));
  } else if (state.busy) {
    inner = '<div class="empty-state"><div class="empty-icon">◌</div><strong>Carregando sua biblioteca...</strong></div>';
  } else if (state.error) {
    inner = '<div class="error-box">' + esc(state.error) + '</div>' + btn("refresh-library", "Tentar novamente", "primary-btn");
  } else if (!state.items.length) {
    inner = '<div class="empty-state"><div class="empty-icon">▣</div><strong>Sua biblioteca ainda está vazia</strong><span>Quando houver títulos cadastrados no Jellyfin, eles vão aparecer aqui.</span></div>';
  } else {
    const visible = visibleItems();
    const hero = visible[0] || state.items.find(function (item) { return item.type !== "Episode"; });
    inner += '<section class="filter-row">' +
      ["Todos", "Anime", "Filme", "Série", "Desenho"].map(function (value, i) {
        const label = ["Todos", "Animes", "Filmes", "Séries", "Desenhos"][i];
        return '<button type="button" class="filter-btn ' + (state.selectedFilter === value ? "active" : "") + '" data-action="filter" data-filter="' + value + '">' + label + '</button>';
      }).join("") + '</section>';
    if (state.libraries.length > 1) {
      inner += '<section class="library-row">' +
        '<button type="button" class="library-btn ' + (!state.selectedLibrary ? "active" : "") + '" data-action="all-libraries">Todas as bibliotecas</button>' +
        state.libraries.map(function (lib) {
          return '<button type="button" class="library-btn ' + (state.selectedLibrary && state.selectedLibrary.id === lib.id ? "active" : "") + '" data-action="select-library" data-id="' + esc(lib.id) + '">' + esc(lib.name) + '</button>';
        }).join("") + '</section>';
    }
    if (hero) {
      const heroUrl = posterUrl(serverBase(), hero, state.token || "");
      inner += '<section class="hero">' +
        (heroUrl ? '<img class="hero-backdrop" src="' + esc(heroUrl) + '" alt="">' : "") +
        '<div class="hero-shade"></div><div class="hero-info"><span class="hero-tag">DESTAQUE DA BIBLIOTECA</span>' +
        '<h1 class="hero-title">' + esc(hero.name) + '</h1><div class="hero-meta">' + esc([hero.year, hero.type === "Series" ? "Série" : "Filme"].filter(Boolean).join(" • ")) + '</div>' +
        (hero.overview ? '<p class="hero-overview">' + esc(hero.overview) + '</p>' : "") +
        '<div class="hero-actions">' + btn("details", "▶ Assistir", "primary-btn", ' data-id="' + esc(hero.id) + '"') +
        btn("details", "ⓘ Detalhes", "secondary-btn", ' data-id="' + esc(hero.id) + '"') + '</div></div></section>';
    }
    inner += posterSection("Continue assistindo", continueWatching());
    inner += posterSection("Recém adicionados", visible);
    inner += posterSection("Sua biblioteca", visible);
    if (!visible.length) inner += '<div class="empty-state"><strong>Nenhum título corresponde aos filtros selecionados.</strong></div>';
  }
  const settings = state.showSettings ? '<div class="back-row">' + btn("close-settings", "Fechar configurações", "secondary-btn") + '</div>' + renderSettingsPanel() : "";
  return '<section class="page">' + settings + inner + footerHtml() + '</section>';
}
function renderMangaPage() {
  return '<section class="page"><h1 class="page-heading">Mangá</h1>' +
    '<div class="empty-state"><div class="empty-icon">▤</div><strong>Em desenvolvimento</strong>' +
    '<span>A seção de mangás ficará disponível em uma próxima etapa, como no aplicativo mobile.</span></div>' +
    footerHtml() + '</section>';
}
function renderFavoritesPage() {
  const rows = state.favorites;
  return '<section class="page"><h1 class="page-heading">Meus favoritos</h1><p class="page-subtitle">Seus títulos salvos neste perfil.</p>' +
    (rows.length ? '<div class="poster-row">' + rows.map(posterCard).join("") + '</div>'
      : '<div class="empty-state"><div class="empty-icon">♡</div><strong>Nenhum favorito ainda</strong><span>Use o coração de um filme ou série para guardar aqui.</span></div>') +
    footerHtml() + '</section>';
}
function renderProfilePage() {
  return '<section class="page"><div class="profile-panel" style="text-align:center">' +
    avatarHtml(state.activeProfile) +
    '<h1 class="page-heading" style="margin-top:18px">' + esc(state.activeProfile && state.activeProfile.name) + '</h1>' +
    '<p class="page-subtitle">Perfil do MMORTEKX CINE</p><div class="profile-actions">' +
    btn("edit-profile", "✎  Editar perfil", "profile-action") +
    btn("history", "◷  Histórico de reprodução (" + state.history.length + ")", "profile-action") +
    btn("switch-profile", "⇄  Trocar perfil", "profile-action") +
    btn("show-server-settings", "⚙  Servidor conectado: " + esc(state.server), "profile-action") +
    '</div></div>' + footerHtml() + '</section>';
}
function renderHistoryPage() {
  return '<section class="page"><div class="back-row">' + btn("back", "← Voltar", "secondary-btn") + '</div>' +
    '<h1 class="page-heading">Histórico</h1><p class="page-subtitle">Os títulos reproduzidos neste perfil.</p>' +
    (state.history.length ? '<div class="list-grid">' + state.history.map(function (item) { return listCard(item); }).join("") + '</div>'
      : '<div class="empty-state"><div class="empty-icon">◷</div><strong>Seu histórico está vazio</strong><span>Os títulos que você assistir aparecerão aqui.</span></div>') +
    footerHtml() + '</section>';
}
function renderDetailsPage() {
  const item = state.currentItem;
  const d = state.detailData || {};
  if (!item) return "";
  const title = d.Name || item.name;
  const overview = d.Overview || item.overview;
  const genres = (d.Genres || []).map(function (genre) {
    const translations = {
      "Action": "Ação", "Action & Adventure": "Ação e aventura", "Adventure": "Aventura", "Animation": "Animação",
      "Comedy": "Comédia", "Crime": "Crime", "Documentary": "Documentário", "Drama": "Drama", "Family": "Família",
      "Fantasy": "Fantasia", "History": "História", "Horror": "Terror", "Music": "Música", "Mystery": "Mistério",
      "Romance": "Romance", "Science Fiction": "Ficção científica", "Sci-Fi": "Ficção científica",
      "Sci-Fi & Fantasy": "Ficção científica e fantasia", "Thriller": "Suspense", "War": "Guerra", "Western": "Faroeste"
    };
    return translations[genre] || genre;
  });
  const backdropTag = d.BackdropImageTags && d.BackdropImageTags.length ? "Backdrop" : "Primary";
  const backdropUrl = serverBase() + "/Items/" + encodeURIComponent(item.id) + "/Images/" + backdropTag + "?quality=90&api_key=" + encodeURIComponent(state.token);
  const coverUrl = posterUrl(serverBase(), item, state.token || "");
  let episodes = "";
  if (item.type === "Series") {
    const seasonOptions = state.seasons.map(function (season) {
      return '<option value="' + esc(season.Id) + '" ' + (String(season.Id) === String(state.seasonId) ? "selected" : "") + '>' + esc(season.Name || "Temporada") + '</option>';
    }).join("");
    episodes = '<section><div class="section-title">EPISÓDIOS ' +
      (state.seasons.length ? '<select class="select-field" id="season-select" style="width:260px;margin-left:auto">' + seasonOptions + '</select>' : "") +
      '</div>' +
      (state.episodesLoading ? '<div class="empty-state">Carregando episódios...</div>' :
        state.episodes.length ? '<div class="episode-list">' + state.episodes.map(function (episode, index) {
          const ep = mapJellyfinItem(episode);
          const epNo = episode.IndexNumber || index + 1;
          const epImage = episode.ImageTags && episode.ImageTags.Primary
            ? serverBase() + "/Items/" + encodeURIComponent(ep.id) + "/Images/Primary?quality=85&api_key=" + encodeURIComponent(state.token)
            : "";
          return '<article class="episode-card">' +
            (epImage ? '<img class="episode-thumb" src="' + esc(epImage) + '" alt="">' : '<div class="episode-thumb poster-placeholder">▶</div>') +
            '<div><div class="episode-title">' + esc(epNo + ". " + ep.name) + '</div>' +
            '<div class="muted">' + esc(formatTicks(episode.RunTimeTicks)) + '</div>' +
            '<div class="episode-overview">' + esc(ep.overview) + '</div></div>' +
            btn("play-episode", "▶ Reproduzir", "primary-btn", ' data-id="' + esc(ep.id) + '" data-name="' + esc(ep.name) + '"') +
            '</article>';
        }).join("") + '</div>' : '<div class="empty-state"><strong>Nenhum episódio nesta temporada.</strong></div>') +
      '</section>';
  }
  return '<section class="page">' +
    '<div class="back-row">' + btn("back", "← Voltar", "secondary-btn") + '</div>' +
    '<section class="detail-hero">' + (backdropUrl ? '<img class="detail-backdrop" src="' + esc(backdropUrl) + '" alt="">' : "") +
    '<div class="detail-shade"></div><div class="detail-content">' +
    (coverUrl ? '<img class="detail-poster" src="' + esc(coverUrl) + '" alt="">' : '<div class="detail-poster poster-placeholder">🎬</div>') +
    '<div class="detail-info"><div class="detail-type">' + (item.type === "Series" ? "SÉRIE" : "FILME") + '</div>' +
    '<h1 class="detail-title">' + esc(title) + '</h1><div class="detail-meta">' +
    esc([d.ProductionYear || item.year, formatTicks(d.RunTimeTicks), item.type === "Series" ? "Série" : "Filme"].filter(Boolean).join(" • ")) +
    '</div></div></div></section>' +
    '<p class="detail-overview">' + esc(overview || "Sem sinopse disponível.") + '</p>' +
    '<div class="hero-actions">' +
    btn("play-current", item.type === "Series" ? "▶ Assistir" : "▶ Reproduzir", "primary-btn") +
    btn("favorite-current", isFavorite(item) ? "♥ Remover dos favoritos" : "♡ Adicionar aos favoritos", "secondary-btn") +
    '</div><div class="genre-list">' + genres.map(function (genre) { return '<span class="genre-chip">' + esc(genre) + '</span>'; }).join("") + '</div>' +
    episodes + footerHtml() + '</section>';
}
function renderModal() {
  if (!state.modal) return "";
  const modal = state.modal;
  if (modal.type === "create") {
    return '<div class="modal-backdrop"><form class="modal" id="create-profile-form"><h2>Criar perfil</h2>' +
      '<label><span class="field-label">Nome do perfil</span><input id="new-profile-name" class="text-field" name="name" maxlength="32" required placeholder="Ex.: Matheus"></label>' +
      '<label style="display:block;margin-top:16px"><span class="field-label">PIN opcional (4 números)</span><input class="text-field" name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="Deixe vazio para não usar PIN"></label>' +
      '<div class="modal-actions">' + btn("cancel-modal", "Cancelar", "secondary-btn") + '<button class="primary-btn" type="submit">Criar perfil</button></div></form></div>';
  }
  if (modal.type === "pin") {
    return '<div class="modal-backdrop"><form class="modal" id="pin-profile-form"><h2>PIN de ' + esc(modal.profile.name) + '</h2>' +
      '<label><span class="field-label">Digite seu PIN de 4 números</span><input id="profile-pin" class="text-field" name="pin" type="password" inputmode="numeric" maxlength="4" required autofocus></label>' +
      '<div class="modal-actions">' + btn("cancel-modal", "Cancelar", "secondary-btn") + '<button class="primary-btn" type="submit">Entrar</button></div></form></div>';
  }
  if (modal.type === "edit") {
    return '<div class="modal-backdrop"><form class="modal" id="edit-profile-form"><h2>Editar perfil</h2>' +
      '<label><span class="field-label">Nome do perfil</span><input class="text-field" name="name" maxlength="32" required value="' + esc(state.activeProfile.name) + '"></label>' +
      '<label style="display:block;margin-top:16px"><span class="field-label">Foto do perfil (opcional)</span><input class="text-field" style="padding-top:12px" name="avatar" type="file" accept="image/*"></label>' +
      '<label style="display:block;margin-top:16px"><span class="field-label">Novo PIN (vazio mantém o atual)</span><input class="text-field" name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}"></label>' +
      '<label class="check-row"><input type="checkbox" name="removePin"> Remover PIN deste perfil</label>' +
      (state.error ? '<div class="error-box">' + esc(state.error) + '</div>' : "") +
      '<div class="modal-actions">' + btn("cancel-modal", "Cancelar", "secondary-btn") + '<button class="primary-btn" type="submit">Salvar</button></div></form></div>';
  }
  return "";
}

async function connect(form) {
  const data = new FormData(form);
  const server = String(data.get("server") || "").trim().replace(/\/+$/, "");
  const username = String(data.get("username") || "").trim();
  const password = String(data.get("password") || "");
  try {
    const parsed = new URL(server);
    if (!parsed.protocol || !parsed.hostname) throw new Error("Informe o endereço completo do servidor.");
  } catch (error) {
    state.error = error.message || "Endereço do servidor inválido.";
    render();
    return;
  }
  state.server = server;
  state.username = username;
  state.password = password;
  state.busy = true;
  state.error = "";
  state.token = null;
  state.userId = null;
  state.libraries = [];
  state.items = [];
  render();
  try {
    const auth = await requestJson(server + "/Users/AuthenticateByName", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Emby-Authorization": 'MediaBrowser Client="MMORTEKX CINE", Device="LG webOS TV", DeviceId="mmortekx-cine-webos", Version="' + APP_VERSION + '"',
        "Authorization": 'MediaBrowser Client="MMORTEKX CINE", Device="LG webOS TV", DeviceId="mmortekx-cine-webos", Version="' + APP_VERSION + '"'
      },
      body: JSON.stringify({ Username: username, Pw: password })
    });
    state.token = auth.AccessToken;
    state.userId = auth.User && auth.User.Id;
    if (!state.token || !state.userId) throw new Error("O Jellyfin não enviou os dados de sessão esperados.");
    localStorage.setItem("mmortekx.server", server);
    localStorage.setItem("mmortekx.username", username);
    await loadLibraries();
    await loadProfiles();
    state.page = "profiles";
    state.showSettings = false;
    state.busy = false;
    render();
  } catch (error) {
    state.busy = false;
    state.error = errorMessage(error);
    render();
  }
}
async function loadLibraries() {
  const data = await requestJson(serverBase() + "/Users/" + encodeURIComponent(state.userId) + "/Views", { headers: jellyfinHeaders() });
  state.libraries = (data.Items || []).map(mapJellyfinItem);
  state.itemCategories = {};
  const combined = new Map();
  for (const library of state.libraries) {
    const rows = await fetchLibraryItems(library);
    rows.forEach(function (item) { combined.set(item.id, item); });
  }
  state.items = Array.from(combined.values()).sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
  state.selectedLibrary = null;
}
async function fetchLibraryItems(library) {
  const url = new URL(serverBase() + "/Users/" + encodeURIComponent(state.userId) + "/Items");
  url.searchParams.set("ParentId", library.id);
  url.searchParams.set("Recursive", "true");
  url.searchParams.set("IncludeItemTypes", "Movie,Series,Episode,Video");
  url.searchParams.set("Fields", "Overview,ProductionYear,DateCreated");
  url.searchParams.set("EnableUserData", "true");
  url.searchParams.set("SortBy", "DateCreated");
  url.searchParams.set("SortOrder", "Descending");
  url.searchParams.set("Limit", "100");
  const data = await requestJson(url.toString(), { headers: jellyfinHeaders() });
  const key = normalizeSearch(library.name);
  const category = key.includes("anime") ? "Anime"
    : (key.includes("desenh") || key.includes("cartoon") || key.includes("infantil") || key.includes("kids")) ? "Desenho"
    : key.includes("filme") ? "Filme" : key.includes("serie") ? "Série" : "";
  return (data.Items || []).map(mapJellyfinItem).filter(function (item) {
    if (category) state.itemCategories[item.id] = category;
    return Boolean(item.id);
  });
}
async function loadProfiles() {
  state.profilesLoading = true;
  state.profilesError = "";
  render();
  try {
    const data = await requestJson(profileBase() + "/api/profiles", { headers: { "Accept": "application/json" } });
    state.profiles = data.profiles || [];
    state.profilesError = "";
  } catch (error) {
    state.profilesError = "Não foi possível acessar o serviço de perfis em " + profileBase() + ". Verifique se o serviço está ativo e se o CORS está configurado para o app webOS. " + errorMessage(error);
  } finally {
    state.profilesLoading = false;
    render();
  }
}
async function createProfile(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const pin = String(data.get("pin") || "");
  if (!name) return toast("Digite um nome para o perfil.");
  if (pin && !/^\d{4}$/.test(pin)) return toast("O PIN precisa ter 4 números.");
  try {
    await requestJson(profileBase() + "/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name, pin: pin, avatar: "capybara" })
    });
    state.modal = null;
    await loadProfiles();
    toast("Perfil criado! Agora selecione-o para entrar.");
  } catch (error) {
    toast(errorMessage(error));
  }
}
async function unlockProfile(profile, pin) {
  try {
    const data = await requestJson(profileBase() + "/api/profiles/" + encodeURIComponent(profile.id) + "/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin || "" })
    });
    state.activeProfile = data.profile;
    state.profileSessionToken = data.sessionToken;
    state.modal = null;
    await loadProfileData();
    state.page = "home";
    render();
  } catch (error) {
    toast(errorMessage(error));
  }
}
function profileDataUrl() {
  return profileBase() + "/api/profiles/" + encodeURIComponent(state.activeProfile.id) + "/data";
}
async function loadProfileData() {
  if (!state.activeProfile || !state.profileSessionToken) return;
  const data = await requestJson(profileDataUrl(), { headers: profileHeaders() });
  state.favorites = (data.favorites || []).filter(function (item) { return item && item.id; });
  state.history = (data.history || []).filter(function (item) { return item && item.id; });
  state.progress = data.progress || {};
}
async function patchProfileData(body) {
  if (!state.activeProfile || !state.profileSessionToken) throw new Error("Selecione um perfil primeiro.");
  return requestJson(profileDataUrl(), {
    method: "PATCH",
    headers: profileHeaders(),
    body: JSON.stringify(body)
  });
}
async function toggleFavorite(item) {
  const exists = isFavorite(item);
  const previous = state.favorites.slice();
  state.favorites = exists ? previous.filter(function (row) { return row.id !== item.id; }) : [item].concat(previous);
  render();
  try {
    await patchProfileData({ favorites: state.favorites });
  } catch (error) {
    state.favorites = previous;
    render();
    toast(errorMessage(error));
  }
}
async function recordHistory(item) {
  const updated = [item].concat(state.history.filter(function (row) { return row.id !== item.id; })).slice(0, 100);
  state.history = updated;
  try {
    await patchProfileData({ history: updated });
  } catch (error) {
    toast("Não foi possível salvar o histórico: " + errorMessage(error));
  }
}
async function saveProgress(item, positionSeconds, durationSeconds) {
  if (!state.activeProfile || !state.profileSessionToken || durationSeconds <= 0) return;
  const updated = Object.assign({}, state.progress);
  if (positionSeconds >= durationSeconds - 15) {
    delete updated[item.id];
  } else {
    updated[item.id] = {
      id: item.id, name: item.name, overview: item.overview, year: item.year,
      imageTag: item.imageTag, type: item.type,
      positionMs: Math.round(positionSeconds * 1000),
      durationMs: Math.round(durationSeconds * 1000),
      updatedAt: Date.now()
    };
  }
  state.progress = updated;
  try {
    await patchProfileData({ progress: updated });
  } catch (error) {
    toast("Não foi possível salvar o progresso: " + errorMessage(error));
  }
}
async function openDetails(item) {
  state.currentItem = item;
  state.detailData = null;
  state.seasons = [];
  state.episodes = [];
  state.seasonId = null;
  state.detailError = "";
  state.page = "details";
  render();
  try {
    const url = new URL(serverBase() + "/Users/" + encodeURIComponent(state.userId) + "/Items/" + encodeURIComponent(item.id));
    url.searchParams.set("Fields", "Overview,Genres,RunTimeTicks,BackdropImageTags,ImageTags");
    state.detailData = await requestJson(url.toString(), { headers: jellyfinHeaders() });
    if (item.type === "Series") await loadSeasons();
  } catch (error) {
    state.detailError = errorMessage(error);
  }
  render();
}
async function loadSeasons() {
  const url = new URL(serverBase() + "/Shows/" + encodeURIComponent(state.currentItem.id) + "/Seasons");
  url.searchParams.set("UserId", state.userId);
  const data = await requestJson(url.toString(), { headers: jellyfinHeaders() });
  state.seasons = data.Items || [];
  if (state.seasons.length) {
    state.seasonId = String(state.seasons[0].Id);
    await loadEpisodes(state.seasonId);
  }
}
async function loadEpisodes(seasonId) {
  state.seasonId = String(seasonId);
  state.episodesLoading = true;
  state.episodes = [];
  render();
  try {
    const url = new URL(serverBase() + "/Shows/" + encodeURIComponent(state.currentItem.id) + "/Episodes");
    url.searchParams.set("UserId", state.userId);
    url.searchParams.set("SeasonId", seasonId);
    url.searchParams.set("Fields", "Overview,RunTimeTicks,UserData,ImageTags");
    url.searchParams.set("SortBy", "IndexNumber");
    url.searchParams.set("SortOrder", "Ascending");
    const data = await requestJson(url.toString(), { headers: jellyfinHeaders() });
    state.episodes = data.Items || [];
  } catch (error) {
    state.detailError = errorMessage(error);
  } finally {
    state.episodesLoading = false;
    render();
  }
}
async function playItem(item) {
  try {
    await recordHistory(item);
    const detailUrl = new URL(serverBase() + "/Users/" + encodeURIComponent(state.userId) + "/Items/" + encodeURIComponent(item.id));
    detailUrl.searchParams.set("Fields", "MediaSources");
    const details = await requestJson(detailUrl.toString(), { headers: jellyfinHeaders() });
    const sources = details.MediaSources || [];
    const sourceId = sources.length ? sources[0].Id : null;
    const url = buildPlaybackUrl(serverBase(), item.id, state.token, sourceId);
    const progress = state.progress[item.id];
    state.player = {
      item: item,
      url: url,
      resumeAt: progress && progress.positionMs ? Number(progress.positionMs) / 1000 : 0,
      returnPage: state.page
    };
    state.playbackSpeed = 1;
    state.page = "player";
    renderPlayer();
  } catch (error) {
    toast("Não foi possível iniciar a reprodução: " + errorMessage(error));
  }
}
function renderPlayer() {
  if (!state.player) return;
  if (!$("#player-shell")) {
    root.innerHTML = '<div class="player-shell" id="player-shell">' +
      '<video id="tv-video" class="player-video" playsinline preload="auto"></video>' +
      '<div class="player-ui" id="player-ui">' +
      '<div class="player-top">' + btn("close-player", "← Voltar", "secondary-btn") +
      '<div class="player-title">' + esc(state.player.item.name) + '</div>' +
      '<label class="field-label" style="margin:0;display:flex;align-items:center;gap:8px">Velocidade <select id="speed-select" class="select-field" style="width:110px;min-height:42px">' +
      [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(function (speed) {
        return '<option value="' + speed + '" ' + (speed === 1 ? "selected" : "") + '>' + (speed === 1 ? "Normal" : speed + "x") + '</option>';
      }).join("") + '</select></label></div>' +
      '<div class="player-center">' +
      btn("seek-back", "↶ 10s", "icon-btn") +
      btn("player-toggle", "Ⅱ", "icon-btn play-main") +
      btn("seek-forward", "10s ↷", "icon-btn") +
      '</div>' +
      '<div class="player-bottom"><span id="current-time">00:00</span><input id="seek-range" class="seek-range" type="range" min="0" max="1000" value="0"><span id="duration-time">00:00</span></div>' +
      '</div><div id="player-error" class="player-error hidden"></div></div>';
    const video = $("#tv-video");
    video.src = state.player.url;
    video.addEventListener("loadedmetadata", function () {
      const resume = state.player && state.player.resumeAt;
      if (resume > 0 && resume < video.duration) video.currentTime = resume;
      video.playbackRate = state.playbackSpeed;
      video.play().then(function () { setPlayerButton(); showPlayerControls(); })
        .catch(function () { showPlayerControls(); toast("Pressione OK para iniciar o vídeo."); });
    });
    video.addEventListener("timeupdate", updatePlayerTimeline);
    video.addEventListener("play", setPlayerButton);
    video.addEventListener("pause", setPlayerButton);
    video.addEventListener("error", function () {
      const error = $("#player-error");
      if (error) {
        error.classList.remove("hidden");
        error.innerHTML = '<div><div style="font-size:44px">⚠</div><h2>Não foi possível reproduzir este vídeo</h2><p>O navegador da TV não conseguiu abrir a transmissão HLS do Jellyfin. Verifique se o servidor consegue fornecer HLS compatível com webOS.</p>' + btn("close-player", "Voltar", "primary-btn") + '</div>';
      }
    });
    state.saveTimer = setInterval(function () { saveCurrentProgress(); }, 10000);
    focusFirst();
  }
}
function setPlayerButton() {
  const video = $("#tv-video");
  const button = $('[data-action="player-toggle"]');
  if (button && video) button.textContent = video.paused ? "▶" : "Ⅱ";
}
function updatePlayerTimeline() {
  const video = $("#tv-video");
  if (!video || !Number.isFinite(video.duration)) return;
  const current = $("#current-time");
  const duration = $("#duration-time");
  const slider = $("#seek-range");
  if (current) current.textContent = formatTime(video.currentTime);
  if (duration) duration.textContent = formatTime(video.duration);
  if (slider && !slider.matches(":active")) slider.value = String(Math.round(video.currentTime / video.duration * 1000));
}
async function saveCurrentProgress() {
  const video = $("#tv-video");
  if (!video || !state.player || !Number.isFinite(video.duration) || video.duration <= 0) return;
  await saveProgress(state.player.item, video.currentTime, video.duration);
}
function showPlayerControls() {
  const ui = $("#player-ui");
  if (!ui) return;
  ui.style.opacity = "1";
  ui.style.pointerEvents = "auto";
  clearTimeout(state.controlsTimer);
  state.controlsTimer = setTimeout(function () {
    const video = $("#tv-video");
    if (video && !video.paused) {
      ui.style.opacity = "0";
      ui.style.pointerEvents = "none";
    }
  }, 5000);
}
async function closePlayer() {
  const video = $("#tv-video");
  clearInterval(state.saveTimer);
  clearTimeout(state.controlsTimer);
  if (video) {
    try { await saveCurrentProgress(); } catch (_) {}
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  state.saveTimer = null;
  state.player = null;
  state.page = state.currentItem ? "details" : "home";
  render();
}
async function back() {
  if (state.page === "player") return closePlayer();
  if (state.modal) { state.modal = null; state.error = ""; render(); return; }
  if (state.page === "details") { state.page = "home"; render(); return; }
  if (state.page === "history") { state.page = "profile"; render(); return; }
  if (state.searchOpen) { state.searchOpen = false; state.searchQuery = ""; render(); return; }
  if (state.showSettings) { state.showSettings = false; render(); return; }
  if (state.page === "home" || state.page === "favorites" || state.page === "profile") {
    if (state.page !== "home") { state.page = "home"; render(); }
  }
}
function focusFirst() {
  setTimeout(function () {
    const first = $$(".app-shell button:not(:disabled), .app-shell input:not(:disabled), .app-shell select:not(:disabled)")
      .find(function (element) { return element.offsetParent !== null; });
    if (first && !$("#profile-pin") && !$("#new-profile-name")) first.focus();
    const auto = $("#profile-pin") || $("#new-profile-name");
    if (auto) auto.focus();
  }, 50);
}
function moveFocus(direction) {
  const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]';
  const candidates = $$(selector).filter(function (element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  });
  const active = document.activeElement;
  if (!candidates.includes(active)) { if (candidates[0]) candidates[0].focus(); return; }
  const a = active.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  candidates.forEach(function (element) {
    if (element === active) return;
    const r = element.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const dx = x - ax, dy = y - ay;
    const major = direction === "left" ? -dx : direction === "right" ? dx : direction === "up" ? -dy : dy;
    const minor = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    if (major <= 3) return;
    const score = major + minor * 2.25 + (minor > major ? minor * 1.5 : 0);
    if (score < bestScore) { bestScore = score; best = element; }
  });
  if (best) {
    best.focus();
    const rect = best.getBoundingClientRect();
    if (rect.top < 90 || rect.bottom > window.innerHeight - 90) best.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
document.addEventListener("click", async function (event) {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  const id = control.dataset.id;
  if (action === "toggle-settings") { state.showSettings = !state.showSettings; render(); }
  else if (action === "close-settings") { state.showSettings = false; render(); }
  else if (action === "open-search") { state.searchOpen = true; state.searchQuery = ""; render(); const input = $("#search-input"); if (input) input.focus(); }
  else if (action === "close-search") { state.searchOpen = false; state.searchQuery = ""; render(); }
  else if (action === "refresh-profiles") loadProfiles();
  else if (action === "new-profile") { state.modal = { type: "create" }; render(); }
  else if (action === "cancel-modal") { state.modal = null; state.error = ""; render(); }
  else if (action === "choose-profile") {
    const profile = state.profiles.find(function (item) { return item.id === id; });
    if (profile) {
      if (profile.hasPin) { state.modal = { type: "pin", profile: profile }; render(); }
      else unlockProfile(profile, "");
    }
  }
  else if (action === "edit-profile") { state.modal = { type: "edit" }; state.error = ""; render(); }
  else if (action === "history") { state.page = "history"; render(); }
  else if (action === "switch-profile") {
    state.activeProfile = null; state.profileSessionToken = null;
    state.favorites = []; state.history = []; state.progress = {};
    state.page = "profiles"; await loadProfiles();
  }
  else if (action === "show-server-settings") { state.page = "home"; state.showSettings = true; render(); }
  else if (action === "nav") {
    const page = control.dataset.page;
    state.page = page;
    render();
  }
  else if (action === "filter") { state.selectedFilter = control.dataset.filter; render(); }
  else if (action === "all-libraries") {
    state.busy = true; state.error = ""; render();
    try {
      const combined = new Map();
      for (const lib of state.libraries) (await fetchLibraryItems(lib)).forEach(function (item) { combined.set(item.id, item); });
      state.items = Array.from(combined.values()).sort(function (a, b) { return (b.year || 0) - (a.year || 0); });
      state.selectedLibrary = null;
    } catch (error) { state.error = errorMessage(error); }
    state.busy = false; render();
  }
  else if (action === "select-library") {
    const lib = state.libraries.find(function (item) { return item.id === id; });
    if (lib) {
      state.busy = true; state.error = ""; render();
      try {
        state.items = await fetchLibraryItems(lib);
        state.selectedLibrary = lib;
        state.selectedFilter = "Todos";
      } catch (error) { state.error = errorMessage(error); }
      state.busy = false; render();
    }
  }
  else if (action === "refresh-library") {
    state.busy = true; state.error = ""; render();
    try { await loadLibraries(); } catch (error) { state.error = errorMessage(error); }
    state.busy = false; render();
  }
  else if (action === "details") {
    const item = state.items.find(function (row) { return row.id === id; }) ||
      state.favorites.find(function (row) { return row.id === id; }) ||
      state.history.find(function (row) { return row.id === id; });
    if (item) openDetails(item);
  }
  else if (action === "favorite") {
    const item = state.items.find(function (row) { return row.id === id; }) ||
      state.favorites.find(function (row) { return row.id === id; }) ||
      state.history.find(function (row) { return row.id === id; });
    if (item) toggleFavorite(item);
  }
  else if (action === "favorite-current" && state.currentItem) toggleFavorite(state.currentItem);
  else if (action === "play-current" && state.currentItem) playItem(state.currentItem);
  else if (action === "play-episode") {
    const episodeId = control.dataset.id;
    const episode = state.episodes.find(function (row) { return String(row.Id) === String(episodeId); });
    if (episode) playItem(mapJellyfinItem(episode));
  }
  else if (action === "back") back();
  else if (action === "close-player") closePlayer();
  else if (action === "player-toggle") {
    const video = $("#tv-video");
    if (video) { if (video.paused) video.play().catch(function () {}); else video.pause(); showPlayerControls(); }
  }
  else if (action === "seek-back" || action === "seek-forward") {
    const video = $("#tv-video");
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (action === "seek-back" ? -10 : 10)));
      showPlayerControls();
    }
  }
});
document.addEventListener("submit", function (event) {
  event.preventDefault();
  const form = event.target;
  if (form.id === "connect-form" || form.id === "settings-form") connect(form);
  else if (form.id === "create-profile-form") createProfile(form);
  else if (form.id === "pin-profile-form") unlockProfile(state.modal.profile, String(new FormData(form).get("pin") || ""));
  else if (form.id === "edit-profile-form") saveProfileEdit(form);
});
async function saveProfileEdit(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const pin = String(formData.get("pin") || "");
  const removePin = formData.get("removePin") === "on";
  if (!name) return toast("Informe um nome.");
  if (pin && !/^\d{4}$/.test(pin)) return toast("O PIN precisa ter 4 números.");
  const body = { name: name };
  if (pin) body.pin = pin;
  if (removePin) body.pin = "";
  const file = formData.get("avatar");
  if (file && file.size) {
    if (file.size > 500000) return toast("Escolha uma imagem de até 500 KB.");
    body.avatarData = await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  try {
    const result = await requestJson(profileBase() + "/api/profiles/" + encodeURIComponent(state.activeProfile.id), {
      method: "PATCH", headers: profileHeaders(), body: JSON.stringify(body)
    });
    state.activeProfile = result.profile;
    state.modal = null;
    await loadProfiles();
    render();
    toast("Perfil atualizado com sucesso!");
  } catch (error) { toast(errorMessage(error)); }
}
document.addEventListener("input", function (event) {
  if (event.target.id === "search-input") {
    state.searchQuery = event.target.value;
    const main = $("#app-main");
    if (main) main.innerHTML = '<section class="page"><h1 class="page-heading">Busca na biblioteca</h1>' +
      (state.searchQuery.trim() ? '<p class="page-subtitle">' + filteredSearch().length + ' resultado(s)</p><div class="poster-row">' + filteredSearch().map(posterCard).join("") + '</div>'
        : '<p class="page-subtitle">Digite parte do nome para pesquisar na sua biblioteca.</p>') + footerHtml() + '</section>';
  }
});
document.addEventListener("change", function (event) {
  if (event.target.id === "season-select") loadEpisodes(event.target.value);
  else if (event.target.id === "speed-select") {
    state.playbackSpeed = Number(event.target.value) || 1;
    const video = $("#tv-video");
    if (video) video.playbackRate = state.playbackSpeed;
    showPlayerControls();
  } else if (event.target.id === "seek-range") {
    const video = $("#tv-video");
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Number(event.target.value) / 1000 * video.duration;
      showPlayerControls();
    }
  }
});
document.addEventListener("keydown", function (event) {
  const key = event.key;
  const code = event.keyCode || event.which;
  const active = document.activeElement;
  const isTextInput = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  if (state.page === "player") {
    const video = $("#tv-video");
    if (code === 461 || code === 10009 || key === "Escape" || key === "Backspace") {
      event.preventDefault(); closePlayer(); return;
    }
    if ((key === "ArrowLeft" || key === "ArrowRight") && active && active.id === "seek-range") return;
    if (key === "ArrowLeft" || code === 412) {
      event.preventDefault();
      if (video && Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.currentTime - 10);
      showPlayerControls(); return;
    }
    if (key === "ArrowRight" || code === 417) {
      event.preventDefault();
      if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, video.currentTime + 10);
      showPlayerControls(); return;
    }
    if (key === "Enter" || key === " " || code === 415 || code === 19) {
      if (active && active.tagName === "BUTTON") return;
      event.preventDefault();
      if (video) { if (video.paused) video.play().catch(function () {}); else video.pause(); showPlayerControls(); }
      return;
    }
    if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault(); showPlayerControls(); moveFocus(key === "ArrowUp" ? "up" : "down"); return;
    }
    return;
  }
  if (code === 461 || code === 10009 || key === "Escape" || (key === "Backspace" && !isTextInput)) {
    event.preventDefault(); back(); return;
  }
  if (isTextInput && (key === "ArrowLeft" || key === "ArrowRight")) return;
  if (active && (active.tagName === "SELECT" || active.type === "range")) return;
  if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
    event.preventDefault();
    moveFocus(key.replace("Arrow", "").toLowerCase());
  } else if (key === "Enter" && active && active.tagName !== "INPUT" && active.tagName !== "SELECT") {
    if (active.tagName === "BUTTON") return;
    event.preventDefault();
    if (active.click) active.click();
  }
});
document.addEventListener("pointermove", function () {
  document.body.classList.add("pointer-used");
}, { passive: true });
window.addEventListener("unload", function () {
  clearInterval(state.saveTimer);
  clearTimeout(state.controlsTimer);
});

render();
