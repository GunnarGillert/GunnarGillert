namespace AlamosHA.Core.Models;

/// <summary>
/// Konfiguration eines Standorts (Nidda oder Büdingen). Wird pro Gerät lokal in config.json gepflegt.
/// </summary>
public sealed class AppConfig
{
    /// <summary>Anzeigename dieses Standorts, z. B. "Büdingen".</summary>
    public string SiteName { get; init; } = "";

    /// <summary>Tailnet-Name laut Tailscale-Adminkonsole, z. B. "drk-buedingen.ts.net" (oder "-" für den Standard-Tailnet des API-Keys).</summary>
    public required string Tailnet { get; init; }

    /// <summary>Read-only Tailscale API-Key (Scope "devices:core"). Wird lokal verschlüsselt abgelegt, siehe ConfigStore.</summary>
    public required string ApiKey { get; init; }

    /// <summary>Tailscale-ID, Hostname oder Gerätename der Gegenstelle (der jeweils anderen Wache).</summary>
    public required string PeerDeviceId { get; init; }

    /// <summary>Tailscale-Hostname oder IP der Gegenstelle für den direkten Konflikt-Check über das Tailnet.</summary>
    public required string PeerTailscaleHost { get; init; }

    /// <summary>Windows-Dienstname des Alamos-Servers auf diesem Rechner.</summary>
    public required string AlamosServiceName { get; init; }

    /// <summary>
    /// true = dieser Standort ist beim allerersten Start (noch keine gespeicherte Rolle) Master.
    /// Genau einer der beiden Standorte muss dies auf true stehen haben, die Gegenstelle auf false.
    /// </summary>
    public bool IsPrimaryByDefault { get; init; }

    /// <summary>Wie oft geprüft wird.</summary>
    public int PollIntervalSeconds { get; init; } = 20;

    /// <summary>Ab welchem Alter des letzten Tailscale-Heartbeats der Gegenstelle sie als offline gilt.</summary>
    public int OfflineThresholdSeconds { get; init; } = 180;

    /// <summary>Wie viele aufeinanderfolgende Prüfungen die Gegenstelle als offline gemeldet werden muss, bevor übernommen wird (Hysterese gegen kurze Aussetzer).</summary>
    public int ConsecutiveOfflineChecksRequired { get; init; } = 3;

    /// <summary>
    /// Wenn true: springt der Standby-Standort automatisch wieder in den Standby-Modus zurück,
    /// sobald der Primary-Standort wieder online ist. Standardmäßig aus, damit ein laufender
    /// Alarm nicht durch eine automatische Rückschaltung unterbrochen wird - Rückschaltung
    /// erfolgt dann manuell über die Oberfläche.
    /// </summary>
    public bool AutoFailback { get; init; }

    /// <summary>TCP-Port für den lokalen Rollen-Status (Konflikt-Check zwischen den Standorten).</summary>
    public int PeerStatusPort { get; init; } = 57575;
}
