using AlamosHA.Core.Models;

namespace AlamosHA.Core.Abstractions;

/// <summary>
/// Fragt direkt bei der Gegenstelle über das Tailscale-Mesh nach, welche Rolle sie gerade zu haben
/// glaubt. Dient als zusätzliche Absicherung unmittelbar vor einer Übernahme, damit nicht versehentlich
/// zwei Master gleichzeitig aktiv werden.
/// </summary>
public interface IPeerStatusClient
{
    Task<PeerReportedRole> GetPeerRoleAsync(CancellationToken ct);
}
