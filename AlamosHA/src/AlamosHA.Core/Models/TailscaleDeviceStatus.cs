namespace AlamosHA.Core.Models;

/// <summary>
/// Von der Tailscale-API gemeldeter Status der Gegenstelle.
/// </summary>
/// <param name="Id">Tailscale-Geräte-ID.</param>
/// <param name="Name">Anzeigename bzw. Hostname des Geräts.</param>
/// <param name="LastSeen">Zeitpunkt des letzten Heartbeats beim Tailscale-Koordinationsserver (unabhängig von direkter Erreichbarkeit).</param>
public sealed record TailscaleDeviceStatus(string Id, string Name, DateTimeOffset LastSeen);
