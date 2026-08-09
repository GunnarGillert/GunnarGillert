namespace AlamosHA.Core.Models;

/// <summary>
/// Rolle dieses Standorts im Alamos-Verbund.
/// </summary>
public enum NodeRole
{
    /// <summary>Rolle wurde noch nicht ermittelt (z. B. direkt nach Programmstart, bevor der Zustand geladen wurde).</summary>
    Unknown,

    /// <summary>Dieser Standort betreibt aktiv den Alamos-Dienst und alarmiert.</summary>
    Master,

    /// <summary>Dieser Standort ist im Bereitschaftsmodus, der Alamos-Dienst ist gestoppt.</summary>
    Standby,
}
