using AlamosHA.Core.Models;

namespace AlamosHA.Core;

public enum PollResultKind
{
    /// <summary>Die Tailscale-API war nicht erreichbar - keine Entscheidung getroffen (mögliche eigene Netzwerkstörung).</summary>
    ApiUnreachable,

    /// <summary>Die API war erreichbar, aber das konfigurierte Gerät der Gegenstelle wurde nicht gefunden (Konfigurationsfehler).</summary>
    PeerNotFound,

    /// <summary>Gegenstelle ist laut Tailscale online, alles normal.</summary>
    PeerOnline,

    /// <summary>Gegenstelle erscheint offline, aber die Hysterese-Schwelle wurde noch nicht erreicht.</summary>
    OfflineSuspected,

    /// <summary>Dieser Standort ist bereits Master, Gegenstelle bleibt offline - erwartungsgemäß während eines Ausfalls.</summary>
    AlreadyMaster,

    /// <summary>Dieser Standort wurde soeben zum Master befördert und hat den Alamos-Dienst gestartet.</summary>
    PromotedToMaster,

    /// <summary>
    /// Widerspruch entdeckt: Tailscale meldet die Gegenstelle als offline, die Gegenstelle antwortet
    /// aber auf direkte Anfrage selbst als Master. Übernahme wurde zur Sicherheit abgebrochen -
    /// erfordert manuelle Prüfung, um doppelte Alarmierung zu vermeiden.
    /// </summary>
    Conflict,

    /// <summary>Automatischer Rückfall in den Standby-Modus, weil der Primary-Standort wieder online ist (nur wenn AutoFailback aktiv ist).</summary>
    AutoFailback,
}

/// <summary>Ergebnis eines einzelnen Prüfzyklus, zur Anzeige in der Oberfläche und fürs Log gedacht.</summary>
public sealed record PollResult(PollResultKind Kind, NodeRole RoleAfter, string Message)
{
    public static PollResult ApiUnreachable(NodeRole role, string reason) =>
        new(PollResultKind.ApiUnreachable, role,
            $"Tailscale-API nicht erreichbar ({reason}). Keine Änderung - eigene Verbindung könnte gestört sein.");

    public static PollResult PeerNotFound(NodeRole role) =>
        new(PollResultKind.PeerNotFound, role,
            "Gegenstelle wurde im Tailnet nicht gefunden. Bitte Konfiguration (PeerDeviceId) prüfen.");

    public static PollResult PeerOnline(NodeRole role, TimeSpan age) =>
        new(PollResultKind.PeerOnline, role,
            $"Gegenstelle online (letzter Kontakt vor {FormatAge(age)}).");

    public static PollResult OfflineSuspected(NodeRole role, TimeSpan age, int count, int required) =>
        new(PollResultKind.OfflineSuspected, role,
            $"Gegenstelle erscheint offline (letzter Kontakt vor {FormatAge(age)}), Prüfung {count}/{required}.");

    public static PollResult AlreadyMaster(NodeRole role, TimeSpan age, int count) =>
        new(PollResultKind.AlreadyMaster, role,
            $"Bereits Master. Gegenstelle weiterhin offline (letzter Kontakt vor {FormatAge(age)}).");

    public static PollResult PromotedToMaster(NodeRole role, TimeSpan age) =>
        new(PollResultKind.PromotedToMaster, role,
            $"Gegenstelle bestätigt offline (letzter Kontakt vor {FormatAge(age)}) - Alamos-Dienst wird jetzt hier gestartet.");

    public static PollResult Conflict(NodeRole role, TimeSpan age) =>
        new(PollResultKind.Conflict, role,
            "KONFLIKT: Tailscale meldet die Gegenstelle offline, sie antwortet aber selbst als Master. Übernahme abgebrochen - bitte manuell prüfen!");

    public static PollResult AutoFailback(NodeRole role) =>
        new(PollResultKind.AutoFailback, role,
            "Primary-Standort wieder online - automatisch in den Standby-Modus zurückgeschaltet.");

    private static string FormatAge(TimeSpan age) =>
        age < TimeSpan.FromMinutes(2) ? $"{(int)age.TotalSeconds}s" : $"{(int)age.TotalMinutes}min";
}
