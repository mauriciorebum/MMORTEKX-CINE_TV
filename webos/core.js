export function normalizeSearch(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function mapJellyfinItem(json = {}) {
  const userData = json.UserData || {};
  const imageTags = json.ImageTags || {};
  return {
    id: String(json.Id || ""),
    name: String(json.Name || "Sem título"),
    overview: String(json.Overview || ""),
    year: Number.isFinite(Number(json.ProductionYear)) ? Number(json.ProductionYear) : null,
    imageTag: imageTags.Primary || null,
    type: String(json.Type || ""),
    position: Number(userData.PlaybackPositionTicks || 0),
    played: userData.Played === true,
  };
}

export function categoryFor(item, itemCategories = {}) {
  if (itemCategories[item.id]) return itemCategories[item.id];
  const title = normalizeSearch(item.name);
  if (title.includes("desenho")) return "Desenho";
  if (item.type === "Movie") return "Filme";
  if (item.type === "Series") return "Série";
  return "";
}

export function profileServerFrom(serverUrl) {
  const url = new URL(serverUrl);
  return url.protocol + "//" + url.hostname + ":8788";
}

export function buildPlaybackUrl(server, itemId, token, mediaSourceId) {
  const url = new URL("/Videos/" + encodeURIComponent(itemId) + "/master.m3u8", server);
  url.searchParams.set("api_key", token);
  if (mediaSourceId) url.searchParams.set("MediaSourceId", mediaSourceId);
  return url.toString();
}

export function posterUrl(server, item, token) {
  if (!item || !item.id || !item.imageTag) return "";
  const url = new URL("/Items/" + encodeURIComponent(item.id) + "/Images/Primary", server);
  url.searchParams.set("tag", item.imageTag);
  url.searchParams.set("api_key", token);
  url.searchParams.set("quality", "85");
  return url.toString();
}

export function formatTicks(ticks) {
  const minutes = Math.round(Number(ticks || 0) / 10000000 / 60);
  if (!minutes || !Number.isFinite(minutes)) return "";
  return minutes >= 60 ? Math.floor(minutes / 60) + "h " + (minutes % 60) + "min" : minutes + " min";
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const secs = value % 60;
  return hours
    ? hours + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0")
    : String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}
