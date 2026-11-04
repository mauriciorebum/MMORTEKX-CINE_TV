import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearch, mapJellyfinItem, categoryFor, profileServerFrom,
  buildPlaybackUrl, formatTicks, formatTime
} from "../webos/core.js";

test("normaliza acentos e espaços para pesquisa", () => {
  assert.equal(normalizeSearch("  Ação, Séries  "), "acao, series");
});

test("mapeia os campos de mídia e progresso do Jellyfin", () => {
  const item = mapJellyfinItem({
    Id: "abc", Name: "Filme", ProductionYear: 2024, Type: "Movie",
    ImageTags: { Primary: "tag" },
    UserData: { PlaybackPositionTicks: 50000000, Played: false }
  });
  assert.equal(item.id, "abc");
  assert.equal(item.year, 2024);
  assert.equal(item.position, 50000000);
  assert.equal(item.imageTag, "tag");
});

test("classifica conteúdo pelo tipo ou biblioteca", () => {
  assert.equal(categoryFor({ id: "1", name: "Filme", type: "Movie" }), "Filme");
  assert.equal(categoryFor({ id: "2", name: "Anime", type: "Series" }, { "2": "Anime" }), "Anime");
  assert.equal(categoryFor({ id: "3", name: "Desenho antigo", type: "Video" }), "Desenho");
});

test("deriva serviço de perfis na porta 8788", () => {
  assert.equal(profileServerFrom("http://192.168.0.100:8096"), "http://192.168.0.100:8788");
});

test("monta endereço de reprodução HLS com token e fonte", () => {
  const url = new URL(buildPlaybackUrl("http://192.168.0.100:8096", "id/1", "secret", "source"));
  assert.equal(url.pathname, "/Videos/id%2F1/master.m3u8");
  assert.equal(url.searchParams.get("api_key"), "secret");
  assert.equal(url.searchParams.get("MediaSourceId"), "source");
});

test("formata duração e posição do player", () => {
  assert.equal(formatTicks(3600 * 10000000), "1h 0min");
  assert.equal(formatTime(3661), "1:01:01");
  assert.equal(formatTime(65), "01:05");
});
