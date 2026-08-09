namespace AlamosHA.Core.Models;

/// <summary>
/// Ergebnis der direkten Rückfrage bei der Gegenstelle (Konflikt-Check), bevor dieser Standort
/// die Master-Rolle übernimmt.
/// </summary>
public enum PeerReportedRole
{
    /// <summary>Gegenstelle war nicht erreichbar (erwartungsgemäß, wenn sie wirklich ausgefallen ist).</summary>
    Unreachable,

    /// <summary>Gegenstelle war erreichbar, hat aber keine verwertbare Antwort geliefert.</summary>
    Unknown,

    /// <summary>Gegenstelle meldet sich selbst als Master.</summary>
    Master,

    /// <summary>Gegenstelle meldet sich selbst als Standby.</summary>
    Standby,
}
