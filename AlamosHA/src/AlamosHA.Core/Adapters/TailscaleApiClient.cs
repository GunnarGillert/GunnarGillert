using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AlamosHA.Core.Abstractions;
using AlamosHA.Core.Models;

namespace AlamosHA.Core.Adapters;

/// <summary>
/// Client für die offizielle Tailscale-REST-API (https://api.tailscale.com). Authentifizierung
/// erfolgt per API-Key (HTTP Basic Auth mit dem Key als Benutzername, wie von Tailscale dokumentiert).
/// Erzeugt euch dafür in der Tailscale-Adminkonsole einen Key mit Scope "devices:core" (read-only) -
/// mehr Rechte braucht dieses Programm nicht.
/// </summary>
public sealed class TailscaleApiClient : ITailscaleClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly string _tailnet;

    public TailscaleApiClient(HttpClient http, string tailnet, string apiKey)
    {
        _http = http;
        _tailnet = tailnet;
        _http.BaseAddress ??= new Uri("https://api.tailscale.com/");
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.ASCII.GetBytes(apiKey + ":")));
    }

    public async Task<TailscaleDeviceStatus?> GetPeerStatusAsync(string peerDeviceId, CancellationToken ct)
    {
        using var response = await _http.GetAsync($"api/v2/tailnet/{Uri.EscapeDataString(_tailnet)}/devices", ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<TailscaleDevicesResponse>(JsonOptions, ct);
        var device = payload?.Devices?.FirstOrDefault(d => Matches(d, peerDeviceId));

        if (device?.LastSeen is null)
        {
            return null;
        }

        var id = device.Id ?? device.NodeId ?? peerDeviceId;
        var name = device.Name ?? device.HostName ?? peerDeviceId;
        return new TailscaleDeviceStatus(id, name, device.LastSeen.Value);
    }

    private static bool Matches(TailscaleDeviceDto device, string peerDeviceId) =>
        string.Equals(device.Id, peerDeviceId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(device.NodeId, peerDeviceId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(device.HostName, peerDeviceId, StringComparison.OrdinalIgnoreCase) ||
        string.Equals(device.Name, peerDeviceId, StringComparison.OrdinalIgnoreCase);

    private sealed class TailscaleDevicesResponse
    {
        [JsonPropertyName("devices")]
        public List<TailscaleDeviceDto>? Devices { get; set; }
    }

    private sealed class TailscaleDeviceDto
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("nodeId")]
        public string? NodeId { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("hostname")]
        public string? HostName { get; set; }

        [JsonPropertyName("lastSeen")]
        public DateTimeOffset? LastSeen { get; set; }
    }
}
