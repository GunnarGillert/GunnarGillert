using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Adapters;

/// <summary>
/// Lädt/speichert die Konfiguration als config.json. Der Tailscale-API-Key wird dabei nicht im
/// Klartext abgelegt, sondern mit der Windows-Datenschutz-API (DPAPI, Benutzerkontext) verschlüsselt -
/// die Datei ist damit nur auf diesem Rechner und für dieses Benutzerkonto lesbar.
/// </summary>
[SupportedOSPlatform("windows")]
public static class ConfigStore
{
    private static readonly byte[] Entropy = "AlamosHA-ApiKey"u8.ToArray();
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    public static AppConfig Load(string path)
    {
        var json = File.ReadAllText(path);
        var dto = JsonSerializer.Deserialize<PersistedConfig>(json, JsonOptions)
                  ?? throw new InvalidDataException($"Konnte Konfiguration nicht aus '{path}' lesen.");

        var apiKeyBytes = ProtectedData.Unprotect(Convert.FromBase64String(dto.ApiKeyEncrypted), Entropy, DataProtectionScope.CurrentUser);

        return new AppConfig
        {
            SiteName = dto.SiteName,
            Tailnet = dto.Tailnet,
            ApiKey = Encoding.UTF8.GetString(apiKeyBytes),
            PeerDeviceId = dto.PeerDeviceId,
            PeerTailscaleHost = dto.PeerTailscaleHost,
            AlamosServiceName = dto.AlamosServiceName,
            IsPrimaryByDefault = dto.IsPrimaryByDefault,
            PollIntervalSeconds = dto.PollIntervalSeconds,
            OfflineThresholdSeconds = dto.OfflineThresholdSeconds,
            ConsecutiveOfflineChecksRequired = dto.ConsecutiveOfflineChecksRequired,
            AutoFailback = dto.AutoFailback,
            PeerStatusPort = dto.PeerStatusPort,
        };
    }

    public static void Save(string path, AppConfig config)
    {
        var encryptedApiKey = ProtectedData.Protect(Encoding.UTF8.GetBytes(config.ApiKey), Entropy, DataProtectionScope.CurrentUser);

        var dto = new PersistedConfig
        {
            SiteName = config.SiteName,
            Tailnet = config.Tailnet,
            ApiKeyEncrypted = Convert.ToBase64String(encryptedApiKey),
            PeerDeviceId = config.PeerDeviceId,
            PeerTailscaleHost = config.PeerTailscaleHost,
            AlamosServiceName = config.AlamosServiceName,
            IsPrimaryByDefault = config.IsPrimaryByDefault,
            PollIntervalSeconds = config.PollIntervalSeconds,
            OfflineThresholdSeconds = config.OfflineThresholdSeconds,
            ConsecutiveOfflineChecksRequired = config.ConsecutiveOfflineChecksRequired,
            AutoFailback = config.AutoFailback,
            PeerStatusPort = config.PeerStatusPort,
        };

        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        File.WriteAllText(path, JsonSerializer.Serialize(dto, JsonOptions));
    }

    private sealed class PersistedConfig
    {
        public string SiteName { get; set; } = "";
        public string Tailnet { get; set; } = "";
        public string ApiKeyEncrypted { get; set; } = "";
        public string PeerDeviceId { get; set; } = "";
        public string PeerTailscaleHost { get; set; } = "";
        public string AlamosServiceName { get; set; } = "";
        public bool IsPrimaryByDefault { get; set; }
        public int PollIntervalSeconds { get; set; } = 20;
        public int OfflineThresholdSeconds { get; set; } = 180;
        public int ConsecutiveOfflineChecksRequired { get; set; } = 3;
        public bool AutoFailback { get; set; }
        public int PeerStatusPort { get; set; } = 57575;
    }
}
