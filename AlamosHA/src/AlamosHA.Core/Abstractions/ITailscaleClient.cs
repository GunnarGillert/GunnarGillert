using AlamosHA.Core.Models;

namespace AlamosHA.Core.Abstractions;

/// <summary>
/// Fragt den Status der Gegenstelle über die offizielle Tailscale-API ab. Die Erreichbarkeit
/// dieser API dient als unabhängiger Zeuge ("Quorum") bei der Split-Brain-Prüfung: Wirft diese
/// Methode eine Exception, war die API selbst nicht erreichbar - dann darf keine Failover-
/// Entscheidung getroffen werden, siehe FailoverEngine.
/// </summary>
public interface ITailscaleClient
{
    /// <summary>
    /// Liefert den zuletzt bekannten Status der Gegenstelle, oder null, wenn das konfigurierte
    /// Gerät im Tailnet nicht gefunden wurde (Konfigurationsfehler). Wirft, wenn die Tailscale-API
    /// selbst nicht erreichbar ist.
    /// </summary>
    Task<TailscaleDeviceStatus?> GetPeerStatusAsync(string peerDeviceId, CancellationToken ct);
}
