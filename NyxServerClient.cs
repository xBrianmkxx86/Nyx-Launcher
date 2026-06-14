using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Nyx_Launcher
{
    // ── Modelos de respuesta ──────────────────────────────────────────────────
    public record AuthResult(bool Ok, string Error = "", string Token = "",
        string AccountType = "Cracked", string SkinPath = "", string SkinModel = "classic");

    public record SkinResult(bool Ok, string Error = "", string SkinUrl = "", string SkinModel = "classic");

    public record NewsItem(string Text);
    public record NewsResult(bool Ok, NewsItem[] News);

    public record SimpleResult(bool Ok, string Error = "");

    // ═════════════════════════════════════════════════════════════════════════
    // NyxServerClient
    // ═════════════════════════════════════════════════════════════════════════
    public static class NyxServerClient
    {
        // ← Cambia esta URL por la de Railway/Render cuando deploys
        public static string ServerUrl { get; set; } = "https://nyx-server.up.railway.app";

        public static string ActiveToken { get; private set; } = "";

        private static readonly HttpClient Http = new()
        {
            Timeout = TimeSpan.FromSeconds(10)
        };

        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNameCaseInsensitive = true
        };

        // ── Health check ──────────────────────────────────────────────────────
        public static async Task<bool> IsServerOnlineAsync()
        {
            try
            {
                var resp = await Http.GetAsync($"{ServerUrl}/health");
                return resp.IsSuccessStatusCode;
            }
            catch { return false; }
        }

        // ── Register ──────────────────────────────────────────────────────────
        public static async Task<SimpleResult> RegisterAsync(string username, string password)
        {
            try
            {
                var body = JsonSerializer.Serialize(new { username, password });
                var resp = await Http.PostAsync($"{ServerUrl}/register",
                    new StringContent(body, Encoding.UTF8, "application/json"));
                var json = await resp.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json).RootElement;
                bool ok = doc.GetProperty("ok").GetBoolean();
                string err = ok ? "" : doc.GetProperty("error").GetString() ?? "";
                return new SimpleResult(ok, err);
            }
            catch (Exception ex) { return new SimpleResult(false, ex.Message); }
        }

        // ── Login ─────────────────────────────────────────────────────────────
        public static async Task<AuthResult> LoginAsync(string username, string password)
        {
            try
            {
                var body = JsonSerializer.Serialize(new { username, password });
                var resp = await Http.PostAsync($"{ServerUrl}/login",
                    new StringContent(body, Encoding.UTF8, "application/json"));
                var json = await resp.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json).RootElement;
                bool ok = doc.GetProperty("ok").GetBoolean();
                if (!ok)
                    return new AuthResult(false, Error: doc.GetProperty("error").GetString() ?? "");

                string token       = doc.GetProperty("token").GetString() ?? "";
                string accType     = doc.GetProperty("accountType").GetString() ?? "Cracked";
                string skinPath    = doc.GetProperty("skinPath").GetString() ?? "";
                string skinModel   = doc.GetProperty("skinModel").GetString() ?? "classic";

                ActiveToken = token;
                return new AuthResult(true, Token: token, AccountType: accType,
                                      SkinPath: skinPath, SkinModel: skinModel);
            }
            catch (Exception ex) { return new AuthResult(false, Error: ex.Message); }
        }

        // ── Get skin URL ──────────────────────────────────────────────────────
        public static async Task<SkinResult> GetSkinUrlAsync(string username)
        {
            try
            {
                var resp = await Http.GetAsync($"{ServerUrl}/skin/{username}");
                var json = await resp.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(json).RootElement;
                bool ok  = doc.GetProperty("ok").GetBoolean();
                if (!ok) return new SkinResult(false, Error: doc.GetProperty("error").GetString() ?? "");
                return new SkinResult(true,
                    SkinUrl:   doc.GetProperty("skinUrl").GetString() ?? "",
                    SkinModel: doc.GetProperty("skinModel").GetString() ?? "classic");
            }
            catch (Exception ex) { return new SkinResult(false, Error: ex.Message); }
        }

        // ── Download skin ─────────────────────────────────────────────────────
        public static async Task<string?> DownloadSkinAsync(string skinUrl, string localPath)
        {
            try
            {
                var bytes = await Http.GetByteArrayAsync(skinUrl);
                Directory.CreateDirectory(Path.GetDirectoryName(localPath)!);
                await File.WriteAllBytesAsync(localPath, bytes);
                return localPath;
            }
            catch { return null; }
        }

        // ── Upload skin ───────────────────────────────────────────────────────
        public static async Task<SimpleResult> UploadSkinAsync(string skinPath, string model)
        {
            if (string.IsNullOrEmpty(ActiveToken))
                return new SimpleResult(false, "Sin token activo");
            try
            {
                using var content = new MultipartFormDataContent();
                content.Add(new StringContent(model), "variant");
                var fileBytes = new ByteArrayContent(await File.ReadAllBytesAsync(skinPath));
                fileBytes.Headers.ContentType = MediaTypeHeaderValue.Parse("image/png");
                content.Add(fileBytes, "file", "skin.png");

                using var req = new HttpRequestMessage(HttpMethod.Post, $"{ServerUrl}/skin/upload");
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ActiveToken);
                req.Content = content;

                var resp = await Http.SendAsync(req);
                var json = await resp.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(json).RootElement;
                bool ok  = doc.GetProperty("ok").GetBoolean();
                string err = ok ? "" : doc.GetProperty("error").GetString() ?? "";
                return new SimpleResult(ok, err);
            }
            catch (Exception ex) { return new SimpleResult(false, ex.Message); }
        }

        // ── News ──────────────────────────────────────────────────────────────
        public static async Task<NewsResult> GetNewsAsync()
        {
            try
            {
                var resp = await Http.GetAsync($"{ServerUrl}/news");
                var json = await resp.Content.ReadAsStringAsync();
                var doc  = JsonDocument.Parse(json).RootElement;
                bool ok  = doc.GetProperty("ok").GetBoolean();
                if (!ok) return new NewsResult(false, Array.Empty<NewsItem>());

                var newsArr = doc.GetProperty("news");
                var items = new System.Collections.Generic.List<NewsItem>();
                foreach (var n in newsArr.EnumerateArray())
                    items.Add(new NewsItem(n.GetProperty("text").GetString() ?? ""));

                return new NewsResult(true, items.ToArray());
            }
            catch { return new NewsResult(false, Array.Empty<NewsItem>()); }
        }
    }
}
